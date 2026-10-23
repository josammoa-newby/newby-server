import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../lib/AppError.js';
import { getQuestion, getRequiredIds } from '../persona/questions.js';
import type { Answers, Mode } from '../persona/types.js';
import {
  isUuid,
  planPatch,
  validateSupervisorCreate,
  validateSupervisorPatch,
} from './supervisorValidation.js';

function answersFor(mode: Mode): Answers {
  return Object.fromEntries(
    getRequiredIds(mode).map((id) => [id, 'options' in getQuestion(id)! ? 'b' : 4]),
  );
}
const QUICK = answersFor('quick');
const FULL = answersFor('full');

function rejects(fn: () => unknown, messagePart?: string) {
  assert.throws(fn, (err: unknown) => {
    return (
      err instanceof AppError &&
      err.status === 400 &&
      err.code === 'VALIDATION_ERROR' &&
      (messagePart === undefined || err.message.includes(messagePart))
    );
  });
}

const create = (extra: Record<string, unknown> = {}) =>
  validateSupervisorCreate({ nickname: '김팀장', answers: QUICK, ...extra });

describe('validateSupervisorCreate', () => {
  it('최소 입력은 기본값(quick, messenger)을 채운다', () => {
    const input = create();
    assert.equal(input.mode, 'quick');
    assert.equal(input.channel, 'messenger');
    assert.equal(input.position, null);
    assert.equal(input.nickname, '김팀장');
  });

  it('nickname 은 필수이고 trim 하며 1~20자', () => {
    assert.equal(create({ nickname: '  김팀장  ' }).nickname, '김팀장');
    rejects(() => validateSupervisorCreate({ answers: QUICK }));
    rejects(() => create({ nickname: '   ' }));
    rejects(() => create({ nickname: 7 }));
    assert.equal(create({ nickname: 'a'.repeat(20) }).nickname.length, 20);
    rejects(() => create({ nickname: 'a'.repeat(21) }));
  });

  it('mode 는 quick|full 만, channel 은 messenger|face|email 만', () => {
    assert.equal(create({ mode: 'full', answers: FULL }).mode, 'full');
    rejects(() => create({ mode: 'fast' }), 'mode');
    rejects(() => create({ mode: 1 }));
    for (const channel of ['messenger', 'face', 'email']) assert.equal(create({ channel }).channel, channel);
    rejects(() => create({ channel: 'sms' }), 'channel');
  });

  it('answers: 누락은 문항 id 를 모두 알려주고, full 인데 quick 응답만 있으면 거절', () => {
    rejects(() => validateSupervisorCreate({ nickname: '김팀장' }), 'answers');
    rejects(() => create({ answers: [] }));
    const { L1: _l1, S4: _s4, ...missing } = QUICK;
    rejects(() => create({ answers: missing }), 'L1, S4');
    rejects(() => create({ mode: 'full' }), 'L3');
  });

  it('answers: 범위 밖 값, 잘못된 키, 알 수 없는 문항은 거절', () => {
    for (const bad of [6, 0, 2.5, '4']) rejects(() => create({ answers: { ...QUICK, L1: bad } }), 'L1');
    rejects(() => create({ answers: { ...QUICK, S1: 'e' } }), 'S1');
    rejects(() => create({ answers: { ...QUICK, L99: 3 } }), 'L99');
  });

  it('서술형: 값이 trim 되고 빈 값은 null, 한도를 넘으면 거절', () => {
    const input = create({
      catchphrases: ['  다시 해와 ', ''],
      angerSignals: '  말수가 줄어든다 ',
      happySignals: '',
      dislikes: null,
      valuesText: '정확성',
      examples: [{ said: ' 검토해보자 ', meant: ' 고치라는 뜻 ' }],
    });
    assert.deepEqual(input.catchphrases, ['다시 해와']);
    assert.equal(input.angerSignals, '말수가 줄어든다');
    assert.equal(input.happySignals, null);
    assert.equal(input.dislikes, null);
    assert.equal(input.valuesText, '정확성');
    assert.deepEqual(input.examples, [{ said: '검토해보자', meant: '고치라는 뜻' }]);

    assert.equal(create({ catchphrases: ['a', 'b', 'c'] }).catchphrases?.length, 3);
    rejects(() => create({ catchphrases: ['a', 'b', 'c', 'd'] }), '3개');
    rejects(() => create({ catchphrases: ['a'.repeat(31)] }));
    rejects(() => create({ catchphrases: 'a' }));
    rejects(() => create({ catchphrases: [1] }));
    rejects(() => create({ angerSignals: 'a'.repeat(301) }));
    rejects(() => create({ dislikes: 5 }));
    const pair = { said: 'a', meant: 'b' };
    assert.equal(create({ examples: [pair, pair, pair] }).examples?.length, 3);
    rejects(() => create({ examples: [pair, pair, pair, pair] }), '3개');
    rejects(() => create({ examples: [{ said: 'a' }] }));
    rejects(() => create({ examples: [{ said: 'a', meant: ' ' }] }));
    rejects(() => create({ examples: [{ said: 'a'.repeat(201), meant: 'b' }] }));
    rejects(() => create({ examples: 'x' }));
  });

  it('id/user_id 등 허용 목록 밖 필드는 거절', () => {
    for (const field of ['id', 'user_id', 'userId', 'scores', 'code', 'isDefault', 'learnedNotes']) {
      rejects(() => create({ [field]: 'x' }), field);
    }
  });

  it('객체가 아닌 body 는 거절', () => {
    for (const body of [undefined, null, [], 'x']) rejects(() => validateSupervisorCreate(body));
  });
});

describe('validateSupervisorPatch', () => {
  it('허용 필드만 통과하고 보낸 필드만 돌려준다', () => {
    assert.deepEqual(validateSupervisorPatch({ nickname: ' 박팀장 ' }), { nickname: '박팀장' });
    assert.deepEqual(validateSupervisorPatch({ position: null, channel: 'email', angerSignals: '' }), {
      position: null,
      channel: 'email',
      angerSignals: null,
    });
    assert.deepEqual(validateSupervisorPatch({ catchphrases: [], examples: [] }), { catchphrases: [], examples: [] });
    assert.deepEqual(validateSupervisorPatch({ mode: 'full', answers: { L3: 5 } }), { mode: 'full', answers: { L3: 5 } });
  });

  it('빈 body, 금지 필드, 잘못된 값은 거절', () => {
    rejects(() => validateSupervisorPatch({}), '수정할 항목');
    rejects(() => validateSupervisorPatch(undefined));
    for (const field of ['id', 'user_id', 'scores', 'code', 'isDefault', 'learnedNotes', 'score_adjust']) {
      rejects(() => validateSupervisorPatch({ nickname: '박팀장', [field]: 'x' }), field);
    }
    rejects(() => validateSupervisorPatch({ nickname: '' }));
    rejects(() => validateSupervisorPatch({ mode: 'slow' }));
    rejects(() => validateSupervisorPatch({ channel: 'sms' }));
    rejects(() => validateSupervisorPatch({ answers: {} }));
    rejects(() => validateSupervisorPatch({ answers: [] }));
    rejects(() => validateSupervisorPatch({ catchphrases: ['a', 'b', 'c', 'd'] }));
  });
});

describe('planPatch', () => {
  const quick = { mode: 'quick' as Mode, answers: QUICK };
  const full = { mode: 'full' as Mode, answers: FULL };

  it('서술형만 바꾸면 재채점하지 않는다', () => {
    const plan = planPatch(quick, { nickname: '박팀장' });
    assert.equal(plan.rescore, false);
    assert.equal(plan.mode, 'quick');
    assert.deepEqual(plan.answers, QUICK);
  });

  it('answers 는 문항 id 단위로 병합하고 재채점한다', () => {
    const plan = planPatch(quick, { answers: { L1: 1, S1: 'd' } });
    assert.equal(plan.rescore, true);
    assert.equal(plan.answers.L1, 1);
    assert.equal(plan.answers.S1, 'd');
    assert.equal(plan.answers.L2, QUICK.L2);
    assert.equal(Object.keys(plan.answers).length, Object.keys(QUICK).length);
  });

  it('quick -> full 승격은 나머지 문항을 같이 보내야 한다', () => {
    rejects(() => planPatch(quick, { mode: 'full' }), 'L3');
    rejects(() => planPatch(quick, { mode: 'full', answers: { L3: 5 } }), 'L4');
    const extra = Object.fromEntries(Object.entries(FULL).filter(([id]) => !(id in QUICK)));
    const plan = planPatch(quick, { mode: 'full', answers: extra });
    assert.equal(plan.mode, 'full');
    assert.equal(plan.rescore, true);
    assert.equal(Object.keys(plan.answers).length, 28);
  });

  it('full -> quick 은 거절, 같은 mode 로 보내는 건 허용', () => {
    rejects(() => planPatch(full, { mode: 'quick' }), '되돌릴 수 없어요');
    rejects(() => planPatch(full, { mode: 'quick', answers: { L1: 5 } }));
    const same = planPatch(full, { mode: 'full' });
    assert.equal(same.mode, 'full');
    assert.equal(same.rescore, false);
  });

  it('병합 결과가 올바르지 않으면 거절 (범위 밖 값, 알 수 없는 문항)', () => {
    rejects(() => planPatch(quick, { answers: { L1: 9 } }), 'L1');
    rejects(() => planPatch(quick, { answers: { L99: 3 } }), 'L99');
    rejects(() => planPatch(quick, { answers: { S2: 'z' } }), 'S2');
  });

  it('full 인 상사의 answers 만 수정해도 full 검증을 한다', () => {
    const plan = planPatch(full, { answers: { L17: 1 } });
    assert.equal(plan.answers.L17, 1);
    assert.equal(plan.mode, 'full');
  });
});

describe('isUuid', () => {
  it('uuid 형식만 통과', () => {
    assert.equal(isUuid('11111111-1111-4111-8111-111111111111'), true);
    const bad = ['abc', '', '1', '11111111-1111-4111-8111-11111111111', 123, null, undefined, "1' or true"];
    for (const value of bad) assert.equal(isUuid(value), false, String(value));
  });
});
