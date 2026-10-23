import * as statsRepository from '../repositories/statsRepository.js';
import type { StatsRow } from '../repositories/statsRepository.js';
import { kstDate, levelFor, nextStreak, visibleStreak } from './progress.js';
import type { LevelInfo } from './progress.js';

export interface Stats extends LevelInfo {
  xp: number;
  streak: number;
  lastActiveDate: string | null;
}

export interface AwardResult {
  stats: Stats;
  gainedXp: number;
  leveledUp: boolean;
}

// 경험치 지급 사유별 기본값 (미션은 미션마다 xp 값을 쓴다)
export const XP_REWARD = {
  diary: 10,
  answerAccepted: 30,
} as const;

const EMPTY: StatsRow = { xp: 0, level: 1, streak: 0, last_active_date: null };

function toStats(row: StatsRow, now: Date): Stats {
  return {
    xp: row.xp,
    ...levelFor(row.xp),
    streak: visibleStreak(row, now),
    lastActiveDate: row.last_active_date,
  };
}

export async function getStats(userId: string, now = new Date()): Promise<Stats> {
  const row = (await statsRepository.findByUser(userId)) ?? EMPTY;
  return toStats(row, now);
}

// 경험치 증감 + 레벨/스트릭 갱신. 미션 완료·일기 작성·답변 채택에서 호출한다.
// delta 가 음수면 되돌리기(미션 체크 해제 등)다. 경험치는 0 아래로 내려가지 않고, 스트릭은 늘어날 때만 기록한다.
export async function addXp(userId: string, delta: number, now = new Date()): Promise<AwardResult> {
  const before = (await statsRepository.findByUser(userId)) ?? EMPTY;
  const xp = Math.max(0, before.xp + Math.trunc(delta));
  const level = levelFor(xp).level;
  const isActivity = delta > 0;
  const saved = await statsRepository.upsert(userId, {
    xp,
    level,
    streak: isActivity ? nextStreak(before, now) : before.streak,
    last_active_date: isActivity ? kstDate(now) : before.last_active_date,
  });
  return { stats: toStats(saved, now), gainedXp: xp - before.xp, leveledUp: level > levelFor(before.xp).level };
}
