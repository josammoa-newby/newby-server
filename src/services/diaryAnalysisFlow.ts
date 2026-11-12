// 일기 분석 흐름. DB/OpenAI 접근은 deps 로 주입받아 목으로 테스트할 수 있다. (supabase 를 직접 import 하지 않는다)
import { analyzeDiaryContent } from '../ai/diaryAnalysis.js';
import type { DiaryAnalysisProfile } from '../ai/diaryAnalysis.js';
import type { OpenAiClient } from '../ai/openai.js';
import { getModel } from '../ai/situation.js';
import { AppError } from '../lib/AppError.js';
import type { DiaryRow } from '../repositories/diaryRepository.js';
import { toAnalysis } from './diaryAnalysis.js';
import type { DiaryAnalysis, StoredAnalysis } from './diaryAnalysis.js';

// 이보다 짧은 일기는 분석하지 않는다 (앞뒤 공백 제외 글자 수)
export const MIN_ANALYZE_LENGTH = 20;

export interface AnalyzeDeps {
  // 내 일기만 돌려준다. (user_id 로 한정)
  findDiary(userId: string, id: string): Promise<DiaryRow | null>;
  findProfile(userId: string): Promise<DiaryAnalysisProfile | null>;
  // 분석한 content/mood 가 지금도 같을 때만 저장하고, 아니면 null
  saveAnalysis(
    userId: string,
    id: string,
    expected: { content: string; mood: string | null },
    analysis: StoredAnalysis,
    analyzedAt: string,
  ): Promise<DiaryRow | null>;
  // OpenAI 클라이언트. 키가 없으면 500 AI_NOT_CONFIGURED 를 던진다.
  getClient(): OpenAiClient;
  now(): Date;
}

export interface AnalyzeResult {
  id: string;
  analysis: DiaryAnalysis;
  // 저장된 분석을 그대로 돌려줬으면 true (AI 를 부르지 않음)
  reused: boolean;
}

const notFound = () => new AppError(404, 'DIARY_NOT_FOUND', '일기를 찾을 수 없습니다.');

export async function analyzeDiary(
  userId: string,
  id: string,
  options: { force: boolean },
  deps: AnalyzeDeps,
): Promise<AnalyzeResult> {
  const row = await deps.findDiary(userId, id);
  if (!row) throw notFound();

  // content/mood 가 수정되면 분석이 비워지므로, 분석이 남아 있으면 지금 일기와 맞는 것이다.
  const existing = toAnalysis(row.analysis, row.analyzed_at);
  if (existing && !options.force) return { id: row.id, analysis: existing, reused: true };

  if (row.content.trim().length < MIN_ANALYZE_LENGTH) {
    throw new AppError(400, 'DIARY_TOO_SHORT', `일기가 너무 짧아서 분석할 수 없어요. ${MIN_ANALYZE_LENGTH}자 이상 써주세요`);
  }

  const client = deps.getClient();
  const profile = await deps.findProfile(userId);
  const result = await analyzeDiaryContent({ content: row.content, mood: row.mood, profile }, client);

  const stored: StoredAnalysis = { ...result, model: getModel() };
  const saved = await deps.saveAnalysis(
    userId,
    row.id,
    { content: row.content, mood: row.mood },
    stored,
    deps.now().toISOString(),
  );
  if (!saved) {
    // 분석하는 동안 일기가 수정됐거나 삭제됐다. 지금 일기와 맞지 않는 분석은 돌려주지 않는다.
    if (!(await deps.findDiary(userId, id))) throw notFound();
    throw new AppError(409, 'DIARY_CHANGED', '분석하는 동안 일기가 수정됐어요. 다시 시도해주세요');
  }

  const analysis = toAnalysis(saved.analysis, saved.analyzed_at);
  if (!analysis) throw new Error('Saved diary analysis is unreadable');
  return { id: saved.id, analysis, reused: false };
}
