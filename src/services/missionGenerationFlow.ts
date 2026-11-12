// 오늘 미션 자동 생성 흐름. DB/OpenAI 접근은 deps 로 주입받아 목으로 테스트할 수 있다. (supabase 를 직접 import 하지 않는다)
import { generateMissions } from '../ai/missionGeneration.js';
import type { MissionGenerationInput, RecentAnalysis } from '../ai/missionGeneration.js';
import { AppError } from '../lib/AppError.js';
import type { DiaryAnalysisProfile } from '../ai/diaryAnalysis.js';
import type { OpenAiClient } from '../ai/openai.js';
import type { DiaryRow } from '../repositories/diaryRepository.js';
import type { MissionRow, NewMission } from '../repositories/missionRepository.js';
import { toAnalysis } from './diaryAnalysis.js';
import { CARE_MISSIONS, DEFAULT_MISSIONS } from './missionDefaults.js';
import type { DefaultMission } from './missionDefaults.js';
import { todayKst, XP_BY_DIFFICULTY } from './missionValidation.js';

// 최근 며칠(오늘 포함)의 일기 분석을 쓰는지, 몇 개까지 쓰는지
export const ANALYSIS_DAYS = 3;
export const MAX_ANALYSES = 3;
// 날짜 범위 안에서 분석이 없는 일기가 섞여 있어도 분석 3개를 채울 수 있게 넉넉히 읽는다.
const DIARY_FETCH_LIMIT = 20;

export interface GenerateDeps {
  listMissions(userId: string, date: string): Promise<MissionRow[]>;
  listRecentDiaries(userId: string, from: string, to: string, limit: number): Promise<DiaryRow[]>;
  findProfile(userId: string): Promise<DiaryAnalysisProfile | null>;
  // (user_id, date, slot) 유니크에 걸리면 null
  insertGenerated(userId: string, missions: NewMission[]): Promise<MissionRow[] | null>;
  // OpenAI 클라이언트. 키가 없으면 500 AI_NOT_CONFIGURED 를 던진다.
  getClient(): OpenAiClient;
  now(): Date;
  // 전체 시간 상한 계산용 시계 (ms)
  clock?: () => number;
  warn(message: string): void;
}

export interface GenerateResult {
  date: string;
  rows: MissionRow[];
  // 이번 호출에서 새로 만들었으면 true (이미 있던 것을 돌려줬으면 false, AI 를 부르지 않음)
  created: boolean;
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function hasGenerated(rows: MissionRow[]): boolean {
  return rows.some((r) => r.slot !== null);
}

// 오류 종류만 남긴다. 메시지에는 키나 응답 원문이 섞일 수 있어서 쓰지 않는다.
function describeError(err: unknown): string {
  if (err instanceof AppError) return `${err.name} ${err.code}`;
  return err instanceof Error ? err.name : 'UnknownError';
}

function fixedPlan(list: readonly DefaultMission[], date: string): NewMission[] {
  return list.map((m, i) => ({
    date,
    title: m.title,
    xp: XP_BY_DIFFICULTY[m.difficulty],
    slot: i + 1,
    source: 'default',
    reason: null,
    difficulty: m.difficulty,
  }));
}

async function recentAnalyses(userId: string, today: string, deps: GenerateDeps): Promise<RecentAnalysis[]> {
  const from = addDays(today, -(ANALYSIS_DAYS - 1));
  const diaries = await deps.listRecentDiaries(userId, from, today, DIARY_FETCH_LIMIT);
  const result: RecentAnalysis[] = [];
  // 최근 순으로 읽어 오므로 앞에서부터 분석이 있는 것만 MAX_ANALYSES 개 모은다.
  for (const diary of diaries) {
    const analysis = toAnalysis(diary.analysis, diary.analyzed_at);
    if (!analysis) continue;
    result.push({
      date: diary.date,
      emotion: analysis.emotion,
      growthPoints: analysis.growthPoints,
      nextStep: analysis.nextStep,
      safetyFlag: analysis.safetyFlag,
    });
    if (result.length >= MAX_ANALYSES) break;
  }
  return result;
}

async function buildPlan(userId: string, today: string, deps: GenerateDeps): Promise<NewMission[]> {
  const analyses = await recentAnalyses(userId, today, deps);
  if (analyses.length === 0) return fixedPlan(DEFAULT_MISSIONS, today);
  // 가장 최근 분석이 safetyFlag 면 AI 를 부르지 않고 마음 돌봄 미션을 쓴다.
  if (analyses[0].safetyFlag) return fixedPlan(CARE_MISSIONS, today);

  try {
    const yesterdayRows = await deps.listMissions(userId, addDays(today, -1));
    const input: MissionGenerationInput = {
      profile: await deps.findProfile(userId),
      analyses,
      yesterday: yesterdayRows.map((r) => ({ title: r.title, done: r.done })),
    };
    const generated = await generateMissions(input, deps.getClient(), { now: deps.clock });
    return generated.map((m, i) => ({
      date: today,
      title: m.title,
      xp: XP_BY_DIFFICULTY[m.difficulty],
      slot: i + 1,
      source: 'ai',
      reason: m.reason,
      difficulty: m.difficulty,
    }));
  } catch (err) {
    // 키 없음, 타임아웃, 응답 오류 등 AI 쪽 문제는 모두 기본 미션으로 대체한다. (미션 화면이 비면 안 된다)
    deps.warn(`AI mission generation failed, using default missions: ${describeError(err)}`);
    return fixedPlan(DEFAULT_MISSIONS, today);
  }
}

// 오늘(KST) 자동 생성 미션이 이미 있으면 AI 를 부르지 않고 그대로 돌려준다.
// 동시에 두 요청이 와도 (user_id, date, slot) 유니크 덕분에 한쪽만 insert 되고 다른 쪽은 그 결과를 읽는다.
export async function generateTodayMissions(userId: string, deps: GenerateDeps): Promise<GenerateResult> {
  const today = todayKst(deps.now());

  const existing = await deps.listMissions(userId, today);
  if (hasGenerated(existing)) return { date: today, rows: existing, created: false };

  const plan = await buildPlan(userId, today, deps);
  const inserted = await deps.insertGenerated(userId, plan);
  if (inserted) return { date: today, rows: await deps.listMissions(userId, today), created: true };

  // 다른 요청이 먼저 만들었다.
  const rows = await deps.listMissions(userId, today);
  if (!hasGenerated(rows)) throw new Error('Mission insert conflicted but no generated missions found');
  return { date: today, rows, created: false };
}
