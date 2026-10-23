import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../lib/AppError.js';
import { getResponseSchema } from '../persona/promptBuilder.js';
import { scorePersona } from '../persona/scoring.js';
import type { Answers } from '../persona/types.js';
import type { SupervisorRow } from '../services/supervisorMapper.js';
import type { GeminiClient, GenerateJsonParams } from './gemini.js';
import {
  askSituation,
  DEFAULT_MODEL,
  getModel,
  MAX_HISTORY,
  parseAnswer,
  summarize,
  TEMPERATURE,
  TIMEOUT_MS,
  toContents,
  toPromptInput,
} from './situation.js';
import type { HistoryMessage } from './situation.js';

const CONSISTENT: Answers = {
  L1: 5, L2: 1, S1: 'a', L5: 5, L6: 1, S2: 'a', L9: 5, L10: 1, S3: 'a', L13: 1, L14: 5, S4: 'a',
};

function supervisor(overrides: Partial<SupervisorRow> = {}): SupervisorRow {
  const scores = scorePersona(CONSISTENT);
  return {
    id: '11111111-1111-4111-8111-111111111111',
    nickname: '김팀장',
    position: '팀장',
    channel: 'messenger',
    mode: 'quick',
    answers: CONSISTENT,
    scores,
    score_adjust: {},
    code: scores.code,
    catchphrases: ['그래서 결론이 뭐야?'],
    anger_signals: '말수가 줄어든다',
    happy_signals: null,
    dislikes: '늦은 보고',
    values_text: null,
    examples: [{ said: '검토해보자', meant: '고치라는 뜻' }],
    learned_notes: ['오전에 보고하면 반응이 좋다'],
    is_default: true,
    created_at: '2026-10-24T00:00:00.000Z',
    updated_at: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

const VALID = {
  intent: '고치라는 완곡한 요청이에요',
  confidence: 'high',
  persona_basis: ['D 직설형'],
  recommended_action: '어느 부분을 고칠지 물어보세요',
  suggested_message: '어느 부분을 보완하면 될까요?',
  avoid: '말없이 다시 내지 않기',
  follow_up_question: null,
  safety_flag: false,
};
const json = (overrides: Record<string, unknown> = {}) => JSON.stringify({ ...VALID, ...overrides });

// 실제 Gemini 를 부르지 않는 목. 준비한 응답(또는 오류)을 차례로 돌려준다.
function mockClient(responses: (string | Error)[]) {
  const calls: GenerateJsonParams[] = [];
  const client: GeminiClient = {
    async generateJson(params) {
      calls.push(params);
      const next = responses.shift();
      if (next === undefined) throw new Error('mock exhausted');
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { client, calls };
}

const ask = (client: GeminiClient, history: HistoryMessage[] = [], userText = '보고서 냈더니 검토해보자고 했어') =>
  askSituation({ supervisor: supervisor(), history, userText }, client);

describe('toPromptInput', () => {
  it('DB 상사 행을 프롬프트 입력으로 바꾼다', () => {
    const input = toPromptInput(supervisor());
    assert.equal(input.nickname, '김팀장');
    assert.equal(input.position, '팀장');
    assert.equal(input.code, 'DCRT');
    assert.equal(input.typeName, '레이더형 팀장');
    assert.equal(input.channel, 'messenger');
    assert.deepEqual(input.W1, ['그래서 결론이 뭐야?']);
    assert.equal(input.W2, '말수가 줄어든다');
    assert.equal(input.W3, null);
    assert.equal(input.W4, '늦은 보고');
    assert.deepEqual(input.W6, [{ 발언: '검토해보자', 의미: '고치라는 뜻' }]);
    assert.deepEqual(input.learnedNotes, ['오전에 보고하면 반응이 좋다']);
    assert.ok(input.ruleLines.length >= 4);
  });

  it('score_adjust 가 있으면 보정된 점수로 코드와 규칙을 만든다', () => {
    const base = toPromptInput(supervisor());
    const adjusted = toPromptInput(supervisor({ score_adjust: { directness: -200 } }));
    assert.equal(adjusted.code, 'ICRT');
    assert.equal(adjusted.typeName, '눈치게임형');
    assert.notDeepEqual(adjusted.ruleLines, base.ruleLines);
  });
});

describe('toContents', () => {
  it('마지막은 이번 userText 이고 ai 는 model 로 바뀐다', () => {
    const contents = toContents(
      [
        { role: 'user', text: '첫 질문' },
        { role: 'ai', text: '첫 답변' },
      ],
      '두번째 질문',
    );
    assert.deepEqual(contents, [
      { role: 'user', parts: [{ text: '첫 질문' }] },
      { role: 'model', parts: [{ text: '첫 답변' }] },
      { role: 'user', parts: [{ text: '두번째 질문' }] },
    ]);
  });

  it('history 는 최근 10개만 쓴다', () => {
    const history: HistoryMessage[] = Array.from({ length: 15 }, (_, i) => ({ role: 'user', text: `m${i}` }));
    const contents = toContents(history, '지금');
    assert.equal(MAX_HISTORY, 10);
    assert.equal(contents.length, 11);
    assert.equal(contents[0].parts[0].text, 'm5');
    assert.equal(contents[9].parts[0].text, 'm14');
    assert.equal(contents[10].parts[0].text, '지금');
  });

  it('맨 앞의 model 턴(첫 인사)은 빼고 빈 텍스트는 건너뛴다', () => {
    const contents = toContents(
      [
        { role: 'ai', text: '이랑 무슨 일 있었어?' },
        { role: 'user', text: '질문' },
        { role: 'ai', text: null },
        { role: 'ai', text: '   ' },
      ],
      '지금',
    );
    assert.deepEqual(
      contents.map((c) => [c.role, c.parts[0].text]),
      [
        ['user', '질문'],
        ['user', '지금'],
      ],
    );
  });

  it('history 가 비어 있으면 userText 만', () => {
    assert.deepEqual(toContents([], '지금'), [{ role: 'user', parts: [{ text: '지금' }] }]);
  });
});

describe('parseAnswer', () => {
  it('올바른 응답을 통과시킨다', () => {
    const answer = parseAnswer(json());
    assert.equal(answer?.confidence, 'high');
    assert.deepEqual(answer?.persona_basis, ['D 직설형']);
    assert.equal(answer?.follow_up_question, null);
    assert.equal(answer?.safety_flag, false);
    assert.equal(parseAnswer(json({ follow_up_question: '어떤 부분이 걸려?' }))?.follow_up_question, '어떤 부분이 걸려?');
    const { follow_up_question: _omit, ...withoutFollowUp } = VALID;
    assert.equal(parseAnswer(JSON.stringify(withoutFollowUp))?.follow_up_question, null);
  });

  it('깨진 JSON, 필수 필드 누락, 빈 persona_basis, 허용 밖 값은 null', () => {
    assert.equal(parseAnswer('{not json'), null);
    assert.equal(parseAnswer(''), null);
    assert.equal(parseAnswer('[]'), null);
    for (const field of ['intent', 'confidence', 'persona_basis', 'recommended_action', 'suggested_message', 'avoid', 'safety_flag']) {
      const { [field]: _omit, ...rest } = VALID as Record<string, unknown>;
      assert.equal(parseAnswer(JSON.stringify(rest)), null, field);
    }
    assert.equal(parseAnswer(json({ persona_basis: [] })), null);
    assert.equal(parseAnswer(json({ persona_basis: ['  '] })), null);
    assert.equal(parseAnswer(json({ persona_basis: 'D 직설형' })), null);
    assert.equal(parseAnswer(json({ confidence: 'very high' })), null);
    assert.equal(parseAnswer(json({ confidence: 0.9 })), null);
    assert.equal(parseAnswer(json({ safety_flag: 'true' })), null);
    assert.equal(parseAnswer(json({ intent: '  ' })), null);
    assert.equal(parseAnswer(json({ follow_up_question: 3 })), null);
  });
});

describe('askSituation', () => {
  it('정상 응답이면 한 번만 호출하고 설정을 그대로 넘긴다', async () => {
    const { client, calls } = mockClient([json()]);
    const answer = await ask(client, [{ role: 'user', text: '이전 질문' }]);
    assert.equal(answer.intent, VALID.intent);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.model, getModel());
    assert.equal(DEFAULT_MODEL, 'gemini-3.5-flash-lite');
    assert.equal(call.thinkingLevel, 'LOW');
    assert.equal(call.temperature, TEMPERATURE);
    assert.equal(call.temperature, 0.4);
    assert.equal(call.timeoutMs, TIMEOUT_MS);
    assert.equal(call.timeoutMs, 30_000);
    assert.deepEqual(call.responseSchema, getResponseSchema());
    assert.ok(call.systemInstruction.includes('김팀장'));
    assert.ok(call.systemInstruction.includes('레이더형 팀장'));
    assert.deepEqual(call.contents.at(-1), { role: 'user', parts: [{ text: '보고서 냈더니 검토해보자고 했어' }] });
  });

  it('JSON 이 깨지면 안내 문장을 붙여 한 번 재시도하고 성공하면 그 응답을 쓴다', async () => {
    const { client, calls } = mockClient(['{broken', json({ intent: '재시도 성공' })]);
    const answer = await ask(client);
    assert.equal(answer.intent, '재시도 성공');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].contents.length, calls[0].contents.length + 1);
    assert.deepEqual(calls[1].contents.at(-1), {
      role: 'user',
      parts: [{ text: '위 상사 프로필을 근거로 persona_basis를 채워서 다시 답하라' }],
    });
  });

  it('persona_basis 가 빈 배열이면 재시도한다', async () => {
    const { client, calls } = mockClient([json({ persona_basis: [] }), json()]);
    await ask(client);
    assert.equal(calls.length, 2);
  });

  it('허용 밖 confidence 도 재시도 대상', async () => {
    const { client, calls } = mockClient([json({ confidence: 'certain' }), json({ confidence: 'low' })]);
    const answer = await ask(client);
    assert.equal(answer.confidence, 'low');
    assert.equal(calls.length, 2);
  });

  it('재시도도 실패하면 502 AI_RESPONSE_INVALID 이고 호출은 딱 2번', async () => {
    const { client, calls } = mockClient(['{broken', json({ persona_basis: [] }), json()]);
    await assert.rejects(
      () => ask(client),
      (err: unknown) => err instanceof AppError && err.status === 502 && err.code === 'AI_RESPONSE_INVALID',
    );
    assert.equal(calls.length, 2);
  });

  it('Gemini 호출 자체가 실패하면 그 오류를 그대로 던지고 재시도하지 않는다', async () => {
    const failure = new AppError(502, 'AI_UNAVAILABLE', 'down');
    const { client, calls } = mockClient([failure]);
    await assert.rejects(() => ask(client), failure);
    assert.equal(calls.length, 1);
  });

  it('history 는 10개로 제한되고 ai 는 model 역할로 넘어간다', async () => {
    const history: HistoryMessage[] = Array.from({ length: 14 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'ai',
      text: `m${i}`,
    }));
    const { client, calls } = mockClient([json()]);
    await ask(client, history);
    const contents = calls[0].contents;
    // 최근 10개(m4~m13)는 user 로 시작해 그대로, 마지막에 이번 질문
    assert.equal(contents.length, 11);
    assert.deepEqual(contents.slice(0, 10).map((c) => c.role), [
      'user', 'model', 'user', 'model', 'user', 'model', 'user', 'model', 'user', 'model',
    ]);
    assert.equal(contents[0].parts[0].text, 'm4');
  });
});

describe('getModel', () => {
  it('기본은 gemini-3.5-flash-lite 이고 GEMINI_MODEL 로 바꿀 수 있다', () => {
    const saved = process.env.GEMINI_MODEL;
    try {
      delete process.env.GEMINI_MODEL;
      assert.equal(getModel(), 'gemini-3.5-flash-lite');
      process.env.GEMINI_MODEL = 'some-other-model';
      assert.equal(getModel(), 'some-other-model');
    } finally {
      if (saved === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = saved;
    }
  });
});

describe('summarize', () => {
  it('intent 한 줄 + 추천 행동 한 줄', () => {
    const answer = parseAnswer(json())!;
    assert.equal(summarize(answer), `${VALID.intent}\n${VALID.recommended_action}`);
  });
});
