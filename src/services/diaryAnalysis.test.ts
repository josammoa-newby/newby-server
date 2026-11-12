import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPatchColumns, shouldResetAnalysis, toAnalysis } from './diaryAnalysis.js';

const STORED = {
  summary: '요약',
  emotion: '뿌듯함',
  strengths: ['잘한 점'],
  growthPoints: ['방향'],
  nextStep: '행동',
  safetyFlag: false,
  model: 'gpt-6-luna',
};
const AT = '2026-11-12T01:25:05.000Z';
const current = { content: '오늘은 처음으로 회의에서 의견을 말했다.', mood: '뿌듯' };

describe('toAnalysis', () => {
  it('저장된 값과 analyzed_at 을 API 모양(generatedAt)으로 바꾼다', () => {
    assert.deepEqual(toAnalysis(STORED, AT), { ...STORED, generatedAt: AT });
  });

  it('없거나 모양이 맞지 않거나 분석 시각이 없으면 null', () => {
    assert.equal(toAnalysis(null, AT), null);
    assert.equal(toAnalysis(undefined, AT), null);
    assert.equal(toAnalysis([], AT), null);
    assert.equal(toAnalysis('x', AT), null);
    assert.equal(toAnalysis(STORED, null), null);
    for (const field of Object.keys(STORED)) {
      const { [field]: _omit, ...rest } = STORED as Record<string, unknown>;
      assert.equal(toAnalysis(rest, AT), null, field);
    }
    assert.equal(toAnalysis({ ...STORED, strengths: 'x' }, AT), null);
    assert.equal(toAnalysis({ ...STORED, safetyFlag: 'false' }, AT), null);
  });
});

describe('content 또는 mood 가 수정되면 analysis 를 비운다', () => {
  it('content 가 바뀌면 analysis 와 analyzed_at 을 null 로 같이 쓴다', () => {
    assert.equal(shouldResetAnalysis(current, { content: '내용을 고쳤다.' }), true);
    assert.deepEqual(buildPatchColumns(current, { content: '내용을 고쳤다.' }), {
      content: '내용을 고쳤다.',
      analysis: null,
      analyzed_at: null,
    });
  });

  it('mood 가 바뀌면(값 변경, 지우기) 비운다', () => {
    assert.equal(shouldResetAnalysis(current, { mood: '피곤' }), true);
    assert.equal(shouldResetAnalysis(current, { mood: null }), true);
    assert.deepEqual(buildPatchColumns(current, { mood: null }), { mood: null, analysis: null, analyzed_at: null });
    assert.equal(shouldResetAnalysis({ content: current.content, mood: null }, { mood: '뿌듯' }), true);
  });

  it('content, mood 가 둘 다 바뀌어도 한 번에 비운다', () => {
    assert.deepEqual(buildPatchColumns(current, { content: '새 내용', mood: '피곤' }), {
      content: '새 내용',
      mood: '피곤',
      analysis: null,
      analyzed_at: null,
    });
  });

  it('같은 값을 다시 보내거나 date 만 바꾸면 분석을 유지한다', () => {
    assert.equal(shouldResetAnalysis(current, { content: current.content }), false);
    assert.equal(shouldResetAnalysis(current, { mood: '뿌듯' }), false);
    assert.equal(shouldResetAnalysis({ content: current.content, mood: null }, { mood: null }), false);
    assert.equal(shouldResetAnalysis(current, { date: '2026-11-11' }), false);
    assert.deepEqual(buildPatchColumns(current, { date: '2026-11-11' }), { date: '2026-11-11' });
    assert.deepEqual(buildPatchColumns(current, { content: current.content, mood: '뿌듯' }), {
      content: current.content,
      mood: '뿌듯',
    });
  });
});
