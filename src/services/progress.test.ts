import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kstDate, levelFor, nextStreak, visibleStreak } from './progress.js';

const now = new Date('2026-10-24T03:00:00Z'); // KST 2026-10-24 12:00
const row = (streak: number, last: string | null) => ({ xp: 0, level: 1, streak, last_active_date: last });

describe('levelFor', () => {
  it('경험치에 맞는 직급을 준다', () => {
    assert.equal(levelFor(0).title, '신입');
    assert.equal(levelFor(49).title, '신입');
    assert.equal(levelFor(50).title, '사원');
    assert.equal(levelFor(5000).title, '부장');
  });
  it('진행률을 계산한다', () => {
    assert.equal(levelFor(25).progress, 50);
    assert.equal(levelFor(5000).progress, 100);
    assert.equal(levelFor(5000).nextLevelXp, null);
  });
});

describe('nextStreak', () => {
  it('처음 활동하면 1', () => assert.equal(nextStreak(row(0, null), now), 1));
  it('오늘 또 활동하면 그대로', () => assert.equal(nextStreak(row(3, '2026-10-24'), now), 3));
  it('어제 활동했으면 +1', () => assert.equal(nextStreak(row(3, '2026-10-23'), now), 4));
  it('하루 이상 쉬면 1부터', () => assert.equal(nextStreak(row(3, '2026-10-21'), now), 1));
});

describe('visibleStreak', () => {
  it('이틀 이상 쉬면 0으로 보여준다', () => assert.equal(visibleStreak(row(5, '2026-10-21'), now), 0));
  it('어제 활동했으면 그대로', () => assert.equal(visibleStreak(row(5, '2026-10-23'), now), 5));
});

describe('kstDate', () => {
  it('UTC 15시 이후는 KST 다음 날', () => {
    assert.equal(kstDate(new Date('2026-10-23T15:30:00Z')), '2026-10-24');
  });
});
