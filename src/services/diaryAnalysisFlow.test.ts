import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAFETY_NOTICE } from '../ai/diaryAnalysis.js';
import type { GenerateJsonParams, OpenAiClient } from '../ai/openai.js';
import { DEFAULT_MODEL } from '../ai/situation.js';
import { AppError } from '../lib/AppError.js';
import type { DiaryRow } from '../repositories/diaryRepository.js';
import { analyzeDiary, MIN_ANALYZE_LENGTH } from './diaryAnalysisFlow.js';
import type { AnalyzeDeps } from './diaryAnalysisFlow.js';
import type { StoredAnalysis } from './diaryAnalysis.js';

const USER = 'user-1';
const OTHER_USER = 'user-2';
const DIARY_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-12T01:25:05.000Z');

const CONTENT = '오늘은 처음으로 회의에서 의견을 말했다. 긴장했지만 끝나고 나니 뿌듯했다.';

const AI_OK = {
  summary: '회의에서 처음으로 의견을 말해 뿌듯했던 하루예요.',
  emotion: '뿌듯함',
  strengths: ['긴장 속에서도 의견을 말했어요'],
  growth_points: ['회의 전에 핵심 한 줄을 정리해 보세요'],
  next_step: '내일 회의 전에 하고 싶은 말을 한 줄로 적어 보세요.',
  safety_flag: false,
};
const ai = (overrides: Record<string, unknown> = {}) => JSON.stringify({ ...AI_OK, ...overrides });

function diaryRow(overrides: Partial<DiaryRow> = {}): DiaryRow {
  return {
    id: DIARY_ID,
    date: '2026-11-12',
    content: CONTENT,
    mood: '뿌듯',
    source: 'manual',
    message_id: null,
    created_at: '2026-11-12T00:00:00.000Z',
    updated_at: '2026-11-12T00:00:00.000Z',
    analysis: null,
    analyzed_at: null,
    ...overrides,
  };
}

const STORED: StoredAnalysis = {
  summary: '저장된 요약',
  emotion: '평온',
  strengths: ['저장된 잘한 점'],
  growthPoints: ['저장된 방향'],
  nextStep: '저장된 행동',
  safetyFlag: false,
  model: 'old-model',
};

interface Harness {
  deps: AnalyzeDeps;
  aiCalls: GenerateJsonParams[];
  saves: { userId: string; id: string; expected: { content: string; mood: string | null }; analysis: StoredAnalysis; analyzedAt: string }[];
  rows: Map<string, DiaryRow>;
}

// DB 와 OpenAI 를 메모리로 대신한다. 일기는 (userId, id) 로만 찾을 수 있어 다른 사용자의 일기는 보이지 않는다.
function harness(options: {
  row?: DiaryRow | null;
  responses?: (string | Error)[];
  noClient?: boolean;
  profile?: { job: string | null; workStyle: string | null } | null;
  // 분석(AI 호출)하는 동안 일기를 바꾸는 동작
  duringAnalysis?: (rows: Map<string, DiaryRow>) => void;
} = {}): Harness {
  const rows = new Map<string, DiaryRow>();
  const row = options.row === undefined ? diaryRow() : options.row;
  if (row) rows.set(`${USER}:${row.id}`, row);
  const responses = [...(options.responses ?? [])];
  const aiCalls: GenerateJsonParams[] = [];
  const saves: Harness['saves'] = [];

  const client: OpenAiClient = {
    async generateJson(params) {
      aiCalls.push(params);
      options.duringAnalysis?.(rows);
      const next = responses.shift();
      if (next === undefined) throw new Error('mock exhausted');
      if (next instanceof Error) throw next;
      return next;
    },
  };

  const deps: AnalyzeDeps = {
    async findDiary(userId, id) {
      return rows.get(`${userId}:${id}`) ?? null;
    },
    async findProfile() {
      return options.profile === undefined ? { job: 'dev', workStyle: 'meticulous' } : options.profile;
    },
    async saveAnalysis(userId, id, expected, analysis, analyzedAt) {
      saves.push({ userId, id, expected, analysis, analyzedAt });
      const current = rows.get(`${userId}:${id}`);
      // 분석한 content/mood 가 지금도 같을 때만 저장한다 (실제 레포지토리와 같은 규칙)
      if (!current || current.content !== expected.content || current.mood !== expected.mood) return null;
      const saved = { ...current, analysis, analyzed_at: analyzedAt };
      rows.set(`${userId}:${id}`, saved);
      return saved;
    },
    getClient() {
      if (options.noClient) throw new AppError(500, 'AI_NOT_CONFIGURED', 'AI 기능이 아직 설정되지 않았어요');
      return client;
    },
    now: () => NOW,
  };
  return { deps, aiCalls, saves, rows };
}

const run = (h: Harness, options: { force?: boolean; userId?: string; id?: string } = {}) =>
  analyzeDiary(options.userId ?? USER, options.id ?? DIARY_ID, { force: options.force ?? false }, h.deps);

async function rejectsWith(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (err: unknown) => err instanceof AppError && err.status === status && err.code === code);
}

describe('정상 분석', () => {
  it('AI 를 1번 부르고 분석을 저장해 돌려준다', async () => {
    const h = harness({ responses: [ai()] });
    const result = await run(h);
    assert.equal(result.id, DIARY_ID);
    assert.equal(result.reused, false);
    assert.equal(result.analysis.summary, AI_OK.summary);
    assert.equal(result.analysis.emotion, '뿌듯함');
    assert.deepEqual(result.analysis.strengths, AI_OK.strengths);
    assert.deepEqual(result.analysis.growthPoints, AI_OK.growth_points);
    assert.equal(result.analysis.nextStep, AI_OK.next_step);
    assert.equal(result.analysis.safetyFlag, false);
    assert.equal(result.analysis.model, DEFAULT_MODEL);
    assert.equal(result.analysis.generatedAt, NOW.toISOString());

    assert.equal(h.aiCalls.length, 1);
    assert.equal(h.saves.length, 1);
    // 분석 당시의 content/mood 와 사용자 id 로 저장한다
    assert.equal(h.saves[0].userId, USER);
    assert.deepEqual(h.saves[0].expected, { content: CONTENT, mood: '뿌듯' });
    assert.equal(h.saves[0].analyzedAt, NOW.toISOString());
    assert.equal(h.saves[0].analysis.model, DEFAULT_MODEL);
    // 저장된 값에는 generatedAt 이 없다 (analyzed_at 컬럼을 쓴다)
    assert.ok(!('generatedAt' in h.saves[0].analysis));
  });

  it('프로필(직무, 일하는 방식)을 프롬프트에 넣고 일기 원문은 사용자 메시지로만 보낸다', async () => {
    const h = harness({ responses: [ai()] });
    await run(h);
    const call = h.aiCalls[0];
    assert.ok(call.instructions.includes('- 직무: 개발'));
    assert.ok(call.instructions.includes('- 일하는 방식: 꼼꼼하게 확인하는 편'));
    assert.ok(!call.instructions.includes(CONTENT));
    assert.ok(call.messages[0].text.includes(CONTENT));
    assert.ok(!('temperature' in call));
  });

  it('프로필이 없어도 분석한다', async () => {
    const h = harness({ responses: [ai()], profile: null });
    await run(h);
    assert.ok(h.aiCalls[0].instructions.includes('(알려진 정보 없음)'));
  });
});

describe('본인 일기만', () => {
  it('다른 사용자의 일기는 404 DIARY_NOT_FOUND 이고 AI 를 부르지 않는다', async () => {
    const h = harness({ responses: [ai()] });
    await rejectsWith(run(h, { userId: OTHER_USER }), 404, 'DIARY_NOT_FOUND');
    assert.equal(h.aiCalls.length, 0);
    assert.equal(h.saves.length, 0);
  });

  it('없는 일기도 404', async () => {
    const h = harness({ row: null, responses: [ai()] });
    await rejectsWith(run(h), 404, 'DIARY_NOT_FOUND');
    assert.equal(h.aiCalls.length, 0);
  });
});

describe('이미 분석된 일기', () => {
  const analyzed = () => diaryRow({ analysis: STORED, analyzed_at: '2026-11-11T09:00:00.000Z' });

  it('저장된 분석을 그대로 돌려주고 AI 를 부르지 않는다', async () => {
    const h = harness({ row: analyzed(), responses: [ai()] });
    const result = await run(h);
    assert.equal(result.reused, true);
    assert.equal(result.analysis.summary, '저장된 요약');
    assert.equal(result.analysis.model, 'old-model');
    assert.equal(result.analysis.generatedAt, '2026-11-11T09:00:00.000Z');
    assert.equal(h.aiCalls.length, 0);
    assert.equal(h.saves.length, 0);
  });

  it('AI 키가 없어도 저장된 분석은 돌려준다', async () => {
    const h = harness({ row: analyzed(), noClient: true });
    assert.equal((await run(h)).reused, true);
  });

  it('force: true 면 다시 분석해서 새 값으로 바꾼다', async () => {
    const h = harness({ row: analyzed(), responses: [ai({ summary: '새로 만든 요약' })] });
    const result = await run(h, { force: true });
    assert.equal(result.reused, false);
    assert.equal(result.analysis.summary, '새로 만든 요약');
    assert.equal(result.analysis.generatedAt, NOW.toISOString());
    assert.equal(h.aiCalls.length, 1);
    assert.equal(h.rows.get(`${USER}:${DIARY_ID}`)?.analyzed_at, NOW.toISOString());
  });

  it('분석 모양이 깨져 있으면 분석이 없는 것으로 보고 새로 분석한다', async () => {
    const h = harness({ row: diaryRow({ analysis: { summary: 1 }, analyzed_at: '2026-11-11T09:00:00.000Z' }), responses: [ai()] });
    assert.equal((await run(h)).reused, false);
    assert.equal(h.aiCalls.length, 1);
  });
});

describe('너무 짧은 일기', () => {
  it(`${MIN_ANALYZE_LENGTH}자 미만이면 400 DIARY_TOO_SHORT 이고 AI 를 부르지 않는다`, async () => {
    const h = harness({ row: diaryRow({ content: '가'.repeat(MIN_ANALYZE_LENGTH - 1) }), responses: [ai()] });
    await rejectsWith(run(h), 400, 'DIARY_TOO_SHORT');
    assert.equal(h.aiCalls.length, 0);
    assert.equal(h.saves.length, 0);
  });

  it('force 여도 짧으면 400', async () => {
    const h = harness({ row: diaryRow({ content: '짧은 일기' }), responses: [ai()] });
    await rejectsWith(run(h, { force: true }), 400, 'DIARY_TOO_SHORT');
  });

  it(`정확히 ${MIN_ANALYZE_LENGTH}자면 분석한다`, async () => {
    const h = harness({ row: diaryRow({ content: '가'.repeat(MIN_ANALYZE_LENGTH) }), responses: [ai()] });
    assert.equal((await run(h)).reused, false);
  });

  it('앞뒤 공백은 글자 수에 넣지 않는다', async () => {
    const h = harness({ row: diaryRow({ content: `   ${'가'.repeat(MIN_ANALYZE_LENGTH - 1)}   ` }), responses: [ai()] });
    await rejectsWith(run(h), 400, 'DIARY_TOO_SHORT');
  });
});

describe('safety_flag', () => {
  it('true 면 서버가 next_step 뒤에 고정 안내 문구(109)를 붙이고 저장한다', async () => {
    const h = harness({
      responses: [ai({ safety_flag: true, strengths: [], growth_points: [], next_step: '오늘은 푹 쉬어도 괜찮아요.' })],
    });
    const result = await run(h);
    assert.equal(result.analysis.safetyFlag, true);
    assert.deepEqual(result.analysis.strengths, []);
    assert.equal(result.analysis.nextStep, `오늘은 푹 쉬어도 괜찮아요. ${SAFETY_NOTICE}`);
    assert.ok(result.analysis.nextStep.includes('109'));
    assert.equal(h.saves[0].analysis.nextStep, result.analysis.nextStep);
    // 안내 문구와 번호는 모델에게 보내는 프롬프트에 들어 있지 않다
    assert.ok(!h.aiCalls[0].instructions.includes('109'));
    assert.ok(!h.aiCalls[0].messages.some((m) => m.text.includes('109')));
  });

  it('false 면 안내 문구가 없다', async () => {
    const h = harness({ responses: [ai()] });
    assert.ok(!(await run(h)).analysis.nextStep.includes(SAFETY_NOTICE));
  });
});

describe('AI 실패', () => {
  it('호출 실패는 502 AI_UNAVAILABLE 이고 아무것도 저장하지 않는다', async () => {
    const h = harness({ responses: [new AppError(502, 'AI_UNAVAILABLE', 'down')] });
    await rejectsWith(run(h), 502, 'AI_UNAVAILABLE');
    assert.equal(h.saves.length, 0);
    assert.equal(h.aiCalls.length, 1);
  });

  it('응답이 두 번 다 올바르지 않으면 502 AI_RESPONSE_INVALID (AI 2번, 저장 없음)', async () => {
    const h = harness({ responses: ['{broken', ai({ strengths: [] })] });
    await rejectsWith(run(h), 502, 'AI_RESPONSE_INVALID');
    assert.equal(h.aiCalls.length, 2);
    assert.equal(h.saves.length, 0);
  });

  it('refusal(AI_RESPONSE_INVALID)은 재시도 없이 502', async () => {
    const h = harness({ responses: [new AppError(502, 'AI_RESPONSE_INVALID', 'refused'), ai()] });
    await rejectsWith(run(h), 502, 'AI_RESPONSE_INVALID');
    assert.equal(h.aiCalls.length, 1);
  });

  it('JSON 이 한 번 깨져도 재시도로 성공하면 저장한다', async () => {
    const h = harness({ responses: ['{broken', ai()] });
    assert.equal((await run(h)).reused, false);
    assert.equal(h.aiCalls.length, 2);
    assert.equal(h.saves.length, 1);
  });

  it('AI 키가 없으면 500 AI_NOT_CONFIGURED', async () => {
    const h = harness({ noClient: true });
    await rejectsWith(run(h), 500, 'AI_NOT_CONFIGURED');
    assert.equal(h.saves.length, 0);
  });
});

describe('분석하는 동안 일기가 바뀐 경우', () => {
  it('content 가 수정되면 저장하지 않고 409 DIARY_CHANGED', async () => {
    const h = harness({
      responses: [ai()],
      duringAnalysis: (rows) => {
        const row = rows.get(`${USER}:${DIARY_ID}`)!;
        rows.set(`${USER}:${DIARY_ID}`, { ...row, content: `${CONTENT} 내용을 더 고쳤다.` });
      },
    });
    await rejectsWith(run(h), 409, 'DIARY_CHANGED');
    assert.equal(h.rows.get(`${USER}:${DIARY_ID}`)?.analysis, null);
  });

  it('mood 만 수정돼도 저장하지 않고 409', async () => {
    const h = harness({
      responses: [ai()],
      duringAnalysis: (rows) => {
        const row = rows.get(`${USER}:${DIARY_ID}`)!;
        rows.set(`${USER}:${DIARY_ID}`, { ...row, mood: '피곤' });
      },
    });
    await rejectsWith(run(h), 409, 'DIARY_CHANGED');
    assert.equal(h.rows.get(`${USER}:${DIARY_ID}`)?.analysis, null);
  });

  it('분석하는 동안 일기가 삭제되면 404', async () => {
    const h = harness({
      responses: [ai()],
      duringAnalysis: (rows) => {
        rows.delete(`${USER}:${DIARY_ID}`);
      },
    });
    await rejectsWith(run(h), 404, 'DIARY_NOT_FOUND');
  });
});

describe('mood 가 없는 일기', () => {
  it('mood 없이 분석하고 expected.mood 는 null 로 저장 조건을 건다', async () => {
    const h = harness({ row: diaryRow({ mood: null }), responses: [ai()] });
    await run(h);
    assert.equal(h.saves[0].expected.mood, null);
    assert.ok(!h.aiCalls[0].messages[0].text.includes('diary_mood'));
  });
});
