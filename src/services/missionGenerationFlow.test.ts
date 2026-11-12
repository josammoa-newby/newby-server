import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GenerateJsonParams, OpenAiClient } from '../ai/openai.js';
import { AppError } from '../lib/AppError.js';
import type { DiaryRow } from '../repositories/diaryRepository.js';
import type { MissionRow, NewMission } from '../repositories/missionRepository.js';
import { CARE_MISSIONS, compareMissionRows, DEFAULT_MISSIONS } from './missionDefaults.js';
import { generateTodayMissions } from './missionGenerationFlow.js';
import type { GenerateDeps } from './missionGenerationFlow.js';

const USER = 'user-1';
const NOW = new Date('2026-11-12T01:00:00.000Z'); // KST 2026-11-12 10:00
const TODAY = '2026-11-12';

const AI_OK = JSON.stringify({
  missions: [
    { title: '회의 전 하고 싶은 말 한 줄 적기', reason: '회의가 부담됐다고 해서요', difficulty: 'easy' },
    { title: '선배에게 모르는 것 하나 질문하기', reason: '질문이 성장 방향이라서요', difficulty: 'medium' },
    { title: '오늘 맡은 일 우선순위 정하기', reason: '업무가 몰렸다고 해서요', difficulty: 'hard' },
  ],
});

function diary(date: string, safetyFlag = false, withAnalysis = true): DiaryRow {
  return {
    id: `d-${date}-${safetyFlag}`,
    date,
    content: '원문은 AI 로 가지 않는다 SECRET-DIARY-TEXT',
    mood: null,
    source: 'manual',
    message_id: null,
    created_at: `${date}T00:00:00.000Z`,
    updated_at: `${date}T00:00:00.000Z`,
    analysis: withAnalysis
      ? {
          summary: '요약 SECRET-SUMMARY',
          emotion: '불안',
          strengths: ['SECRET-STRENGTH'],
          growthPoints: ['질문하기'],
          nextStep: '질문 하나 하기',
          safetyFlag,
          model: 'm',
        }
      : null,
    analyzed_at: withAnalysis ? `${date}T01:00:00.000Z` : null,
  };
}

interface Options {
  diaries?: DiaryRow[];
  seed?: MissionRow[];
  ai?: (string | Error)[];
  noClient?: boolean;
}

function setup(opts: Options = {}) {
  const rows: MissionRow[] = [...(opts.seed ?? [])];
  const aiCalls: GenerateJsonParams[] = [];
  const warnings: string[] = [];
  const responses = [...(opts.ai ?? [])];
  let seq = 0;

  const client: OpenAiClient = {
    async generateJson(params) {
      aiCalls.push(params);
      const next = responses.shift();
      if (next === undefined) throw new Error('unexpected AI call');
      if (next instanceof Error) throw next;
      return next;
    },
  };

  const deps: GenerateDeps = {
    async listMissions(_u, date) {
      // 여러 요청이 끼어들 수 있게 한 틱 양보
      await Promise.resolve();
      return rows.filter((r) => r.date === date).sort(compareMissionRows);
    },
    async listRecentDiaries() {
      await Promise.resolve();
      return opts.diaries ?? [];
    },
    async findProfile() {
      return { job: 'dev', workStyle: 'asks-a-lot' };
    },
    // 실제 DB 의 (user_id, date, slot) 유니크와 한 문장 insert(전부 또는 없음)를 흉내 낸다.
    async insertGenerated(_u: string, missions: NewMission[]) {
      await Promise.resolve();
      const conflict = missions.some((m) => rows.some((r) => r.date === m.date && r.slot === m.slot && r.slot !== null));
      if (conflict) return null;
      const created = missions.map<MissionRow>((m) => ({
        id: `m-${++seq}`,
        date: m.date,
        title: m.title,
        done: false,
        xp: m.xp,
        slot: m.slot ?? null,
        source: m.source ?? 'manual',
        reason: m.reason ?? null,
        difficulty: m.difficulty ?? null,
        created_at: '2026-11-12T01:00:00.000Z', // 모두 같은 시각
      }));
      rows.push(...created);
      return created;
    },
    getClient() {
      if (opts.noClient) throw new AppError(500, 'AI_NOT_CONFIGURED', 'AI 기능이 아직 설정되지 않았어요');
      return client;
    },
    now: () => NOW,
    warn: (m) => warnings.push(m),
  };
  return { deps, rows, aiCalls, warnings };
}

const slots = (rows: MissionRow[]) => rows.map((r) => r.slot);

describe('generateTodayMissions', () => {
  it('정상 생성: AI 미션 3개, XP 는 서버가 난이도로 정한다', async () => {
    const t = setup({ diaries: [diary('2026-11-11')], ai: [AI_OK] });
    const result = await generateTodayMissions(USER, t.deps);
    assert.equal(result.created, true);
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.rows.map((r) => r.source), ['ai', 'ai', 'ai']);
    assert.deepEqual(result.rows.map((r) => r.xp), [10, 20, 30]);
    assert.deepEqual(slots(result.rows), [1, 2, 3]);
    assert.equal(result.rows[0].reason, '회의가 부담됐다고 해서요');
    assert.equal(t.aiCalls.length, 1);
    assert.equal(t.aiCalls[0].timeoutMs, 20_000);
  });

  it('일기 원문과 요약/잘한 점은 AI 로 보내지 않는다', async () => {
    const t = setup({ diaries: [diary('2026-11-11')], ai: [AI_OK] });
    await generateTodayMissions(USER, t.deps);
    const sent = JSON.stringify(t.aiCalls);
    assert.ok(!sent.includes('SECRET-DIARY-TEXT'));
    assert.ok(!sent.includes('SECRET-SUMMARY'));
    assert.ok(!sent.includes('SECRET-STRENGTH'));
    assert.ok(sent.includes('질문하기'));
  });

  it('어제 미션 제목과 완료 여부를 AI 입력에 넣는다', async () => {
    const yesterday: MissionRow = {
      id: 'y1', date: '2026-11-11', title: '어제의 미션', done: true, xp: 10, slot: 1,
      source: 'default', reason: null, difficulty: 'easy', created_at: '2026-11-11T00:00:00.000Z',
    };
    const t = setup({ diaries: [diary('2026-11-11')], ai: [AI_OK], seed: [yesterday] });
    await generateTodayMissions(USER, t.deps);
    assert.match(JSON.stringify(t.aiCalls), /어제의 미션 \(완료\)/);
  });

  it('오늘 이미 있으면 AI 를 부르지 않고 기존 것을 돌려준다 (멱등)', async () => {
    const t = setup({ diaries: [diary('2026-11-11')], ai: [AI_OK] });
    const first = await generateTodayMissions(USER, t.deps);
    const second = await generateTodayMissions(USER, t.deps);
    assert.equal(second.created, false);
    assert.deepEqual(second.rows.map((r) => r.id), first.rows.map((r) => r.id));
    assert.equal(t.aiCalls.length, 1);
    assert.equal(t.rows.length, 3);
  });

  it('직접 만든 미션만 있으면(slot 없음) 자동 생성은 여전히 진행한다', async () => {
    const manual: MissionRow = {
      id: 'mm', date: TODAY, title: '내가 만든 미션', done: false, xp: 10, slot: null,
      source: 'manual', reason: null, difficulty: null, created_at: '2026-11-12T00:00:00.000Z',
    };
    const t = setup({ seed: [manual] });
    const result = await generateTodayMissions(USER, t.deps);
    assert.equal(result.created, true);
    assert.deepEqual(slots(result.rows), [1, 2, 3, null]); // 직접 만든 미션은 뒤
  });

  it('동시 요청이 와도 3개를 넘지 않는다 (유니크 충돌 시 기존 것을 읽는다)', async () => {
    const t = setup({ diaries: [diary('2026-11-11')], ai: [AI_OK, AI_OK] });
    const [a, b] = await Promise.all([generateTodayMissions(USER, t.deps), generateTodayMissions(USER, t.deps)]);
    assert.equal(t.rows.length, 3);
    assert.equal([a, b].filter((r) => r.created).length, 1);
    assert.deepEqual(a.rows.map((r) => r.id), b.rows.map((r) => r.id));
  });

  it('분석이 없으면 기본 미션으로 대체하고 AI 를 부르지 않는다', async () => {
    const t = setup({ diaries: [diary('2026-11-11', false, false)] });
    const result = await generateTodayMissions(USER, t.deps);
    assert.deepEqual(result.rows.map((r) => r.title), DEFAULT_MISSIONS.map((m) => m.title));
    assert.deepEqual(result.rows.map((r) => r.source), ['default', 'default', 'default']);
    assert.deepEqual(result.rows.map((r) => r.xp), [10, 10, 10]);
    assert.equal(t.aiCalls.length, 0);
  });

  it('AI 가 실패하면 기본 미션으로 대체하고 경고 한 줄만 남긴다', async () => {
    const t = setup({ diaries: [diary('2026-11-11')], ai: [new AppError(502, 'AI_UNAVAILABLE', 'sk-secret-key 노출 금지')] });
    const result = await generateTodayMissions(USER, t.deps);
    assert.equal(result.created, true);
    assert.deepEqual(result.rows.map((r) => r.source), ['default', 'default', 'default']);
    assert.equal(t.warnings.length, 1);
    assert.match(t.warnings[0], /AI_UNAVAILABLE/);
    assert.ok(!t.warnings[0].includes('sk-secret-key'));
  });

  it('AI 미설정(키 없음)도 기본 미션으로 대체한다', async () => {
    const t = setup({ diaries: [diary('2026-11-11')], noClient: true });
    const result = await generateTodayMissions(USER, t.deps);
    assert.deepEqual(result.rows.map((r) => r.source), ['default', 'default', 'default']);
    assert.match(t.warnings[0], /AI_NOT_CONFIGURED/);
  });

  it('3개가 아닌 응답은 재시도하고, 재시도도 실패하면 기본 미션으로 대체한다', async () => {
    const bad = JSON.stringify({ missions: [] });
    const retried = setup({ diaries: [diary('2026-11-11')], ai: [bad, AI_OK] });
    assert.deepEqual((await generateTodayMissions(USER, retried.deps)).rows.map((r) => r.source), ['ai', 'ai', 'ai']);
    assert.equal(retried.aiCalls.length, 2);

    const failed = setup({ diaries: [diary('2026-11-11')], ai: [bad, bad] });
    const result = await generateTodayMissions(USER, failed.deps);
    assert.deepEqual(result.rows.map((r) => r.source), ['default', 'default', 'default']);
    assert.equal(failed.aiCalls.length, 2);
  });

  it('가장 최근 분석이 safetyFlag 면 AI 없이 마음 돌봄 미션을 쓴다', async () => {
    const t = setup({ diaries: [diary('2026-11-12', true), diary('2026-11-11')], ai: [AI_OK] });
    const result = await generateTodayMissions(USER, t.deps);
    assert.deepEqual(result.rows.map((r) => r.title), CARE_MISSIONS.map((m) => m.title));
    assert.equal(result.rows[0].source, 'default');
    assert.equal(t.aiCalls.length, 0);
  });

  it('safetyFlag 가 더 오래된 분석에만 있으면 AI 를 부른다', async () => {
    const t = setup({ diaries: [diary('2026-11-12'), diary('2026-11-10', true)], ai: [AI_OK] });
    const result = await generateTodayMissions(USER, t.deps);
    assert.equal(result.rows[0].source, 'ai');
  });
});

describe('정렬', () => {
  const base = { done: false, xp: 10, reason: null, difficulty: null, source: 'default' as const, date: TODAY };
  it('created_at 이 같아도 slot 순이고, slot 없는 미션은 뒤에 온다', () => {
    const same = '2026-11-12T01:00:00.000Z';
    const list: MissionRow[] = [
      { ...base, id: 'c', title: 'c', slot: 3, created_at: same },
      { ...base, id: 'x', title: 'x', slot: null, created_at: '2026-11-12T00:00:00.000Z' },
      { ...base, id: 'a', title: 'a', slot: 1, created_at: same },
      { ...base, id: 'b', title: 'b', slot: 2, created_at: same },
    ];
    const expected = ['a', 'b', 'c', 'x'];
    assert.deepEqual([...list].sort(compareMissionRows).map((r) => r.id), expected);
    assert.deepEqual([...list].reverse().sort(compareMissionRows).map((r) => r.id), expected);
  });

  it('slot 도 시각도 같으면 id 로 고정한다', () => {
    const same = '2026-11-12T01:00:00.000Z';
    const list: MissionRow[] = [
      { ...base, id: 'b', title: 'b', slot: null, created_at: same },
      { ...base, id: 'a', title: 'a', slot: null, created_at: same },
    ];
    assert.deepEqual(list.sort(compareMissionRows).map((r) => r.id), ['a', 'b']);
  });
});
