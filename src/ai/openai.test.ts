import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../lib/AppError.js';
import {
  buildRequest,
  DEFAULT_REASONING_EFFORT,
  extractJsonText,
  getOpenAiClient,
  getReasoningEffort,
  REASONING_EFFORTS,
} from './openai.js';
import type { GenerateJsonParams } from './openai.js';
import { findStrictViolations } from './strictSchema.js';

const PARAMS: GenerateJsonParams = {
  model: 'gpt-6-luna',
  instructions: '시스템 지침',
  messages: [
    { role: 'user', text: '첫 질문' },
    { role: 'assistant', text: '첫 답변' },
    { role: 'user', text: '지금 질문' },
  ],
  schemaName: 'test_schema',
  schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
  reasoningEffort: 'low',
  timeoutMs: 30_000,
};

// 환경변수를 바꿔 실행하고 원래대로 돌려놓는다. (키 값은 출력하지 않는다)
function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const name of Object.keys(values)) saved[name] = process.env[name];
  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    run();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe('buildRequest', () => {
  it('Responses API 요청: instructions + input + json_schema strict + reasoning, temperature 없음', () => {
    const body = buildRequest(PARAMS);
    assert.equal(body.model, 'gpt-6-luna');
    assert.equal(body.instructions, '시스템 지침');
    assert.deepEqual(body.input, [
      { role: 'user', content: '첫 질문' },
      { role: 'assistant', content: '첫 답변' },
      { role: 'user', content: '지금 질문' },
    ]);
    assert.deepEqual(body.text, {
      format: { type: 'json_schema', name: 'test_schema', strict: true, schema: PARAMS.schema },
    });
    assert.deepEqual(body.reasoning, { effort: 'low' });
    assert.ok(!('temperature' in body));
    assert.equal(body.store, false);
  });

  it('reasoning effort 는 넘긴 값을 그대로 쓴다', () => {
    assert.deepEqual(buildRequest({ ...PARAMS, reasoningEffort: 'medium' }).reasoning, { effort: 'medium' });
  });
});

describe('extractJsonText', () => {
  it('output_text 를 그대로 돌려준다', () => {
    const output = [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }];
    assert.equal(extractJsonText({ status: 'completed', output, output_text: '{"ok":true}' }), '{"ok":true}');
  });

  it('출력이 비어 있으면 빈 문자열(호출한 쪽에서 형식 오류로 처리)', () => {
    assert.equal(extractJsonText({ status: 'completed', output: [] }), '');
    assert.equal(extractJsonText({ status: 'incomplete', output: [], output_text: '' }), '');
  });

  it('message 안에 refusal 이 있으면 502 AI_RESPONSE_INVALID', () => {
    const output = [{ type: 'message', content: [{ type: 'refusal', refusal: '도와줄 수 없어요' }] }];
    assert.throws(
      () => extractJsonText({ status: 'completed', output, output_text: '' }),
      (err: unknown) => err instanceof AppError && err.status === 502 && err.code === 'AI_RESPONSE_INVALID',
    );
  });

  it('출력 항목 자체가 refusal 이어도 502 AI_RESPONSE_INVALID', () => {
    assert.throws(
      () => extractJsonText({ status: 'completed', output: [{ type: 'refusal', refusal: 'x' }] }),
      (err: unknown) => err instanceof AppError && err.code === 'AI_RESPONSE_INVALID',
    );
  });

  it('refusal 이 있으면 output_text 가 있어도 쓰지 않는다', () => {
    const output = [
      { type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }, { type: 'refusal', refusal: 'x' }] },
    ];
    assert.throws(() => extractJsonText({ status: 'completed', output, output_text: '{"ok":true}' }));
  });

  it('응답 상태가 failed 이면 502 AI_UNAVAILABLE', () => {
    assert.throws(
      () => extractJsonText({ status: 'failed', output: [] }),
      (err: unknown) => err instanceof AppError && err.status === 502 && err.code === 'AI_UNAVAILABLE',
    );
  });
});

describe('getReasoningEffort', () => {
  it('기본은 low 이고 OPENAI_REASONING_EFFORT 로 바꿀 수 있다', () => {
    assert.equal(DEFAULT_REASONING_EFFORT, 'low');
    withEnv({ OPENAI_REASONING_EFFORT: undefined }, () => assert.equal(getReasoningEffort(), 'low'));
    withEnv({ OPENAI_REASONING_EFFORT: '' }, () => assert.equal(getReasoningEffort(), 'low'));
    for (const effort of REASONING_EFFORTS) {
      withEnv({ OPENAI_REASONING_EFFORT: effort }, () => assert.equal(getReasoningEffort(), effort));
    }
  });

  it('허용 밖 값이면 500 AI_NOT_CONFIGURED', () => {
    withEnv({ OPENAI_REASONING_EFFORT: 'turbo' }, () => {
      assert.throws(
        () => getReasoningEffort(),
        (err: unknown) => err instanceof AppError && err.status === 500 && err.code === 'AI_NOT_CONFIGURED',
      );
    });
  });
});

describe('getOpenAiClient', () => {
  it('OPENAI_API_KEY 가 없으면 500 AI_NOT_CONFIGURED', () => {
    withEnv({ OPENAI_API_KEY: undefined }, () => {
      assert.throws(
        () => getOpenAiClient(),
        (err: unknown) => err instanceof AppError && err.status === 500 && err.code === 'AI_NOT_CONFIGURED',
      );
    });
  });

  it('키가 있어도 OPENAI_REASONING_EFFORT 가 잘못됐으면 요청 전에 500 AI_NOT_CONFIGURED', () => {
    withEnv({ OPENAI_API_KEY: 'test-key-not-real', OPENAI_REASONING_EFFORT: 'turbo' }, () => {
      assert.throws(
        () => getOpenAiClient(),
        (err: unknown) => err instanceof AppError && err.code === 'AI_NOT_CONFIGURED',
      );
    });
  });
});

describe('strictSchema', () => {
  it('규칙을 어긴 스키마를 찾아낸다', () => {
    const bad = {
      type: 'OBJECT',
      properties: { a: { type: 'STRING', nullable: true }, b: { type: 'string' } },
      required: ['a'],
      propertyOrdering: ['a', 'b'],
    };
    const problems = findStrictViolations(bad).join('\n');
    assert.match(problems, /additionalProperties/);
    assert.match(problems, /required 에 없어요/);
    assert.match(problems, /nullable/);
    assert.match(problems, /propertyOrdering/);
    assert.match(problems, /소문자/);
  });

  it('올바른 스키마(중첩 object, anyOf, 배열)는 위반이 없다', () => {
    const good = {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: { type: 'object', properties: { x: { type: ['string', 'null'] } }, required: ['x'], additionalProperties: false },
        },
        hint: {
          anyOf: [
            { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false },
            { type: 'null' },
          ],
        },
      },
      required: ['list', 'hint'],
      additionalProperties: false,
    };
    assert.deepEqual(findStrictViolations(good), []);
  });
});
