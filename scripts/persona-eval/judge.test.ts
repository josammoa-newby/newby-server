import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findStrictViolations } from '../../src/ai/strictSchema.js';
import { JUDGE_SCHEMA } from './judge.js';

describe('JUDGE_SCHEMA', () => {
  it('OpenAI strict json_schema 규칙을 지킨다', () => {
    assert.deepEqual(findStrictViolations(JUDGE_SCHEMA), []);
  });
});
