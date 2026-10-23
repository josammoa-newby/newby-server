// 직급(레벨)과 연속 기록 계산. DB 를 쓰지 않는 순수 함수만 둔다. (테스트하기 쉽게)
// 직급(레벨) 표. minXp 는 그 직급이 되기 위한 누적 경험치.
export const LEVELS = [
  { level: 1, title: '신입', minXp: 0 },
  { level: 2, title: '사원', minXp: 50 },
  { level: 3, title: '주임', minXp: 150 },
  { level: 4, title: '대리', minXp: 300 },
  { level: 5, title: '과장', minXp: 500 },
  { level: 6, title: '차장', minXp: 800 },
  { level: 7, title: '부장', minXp: 1200 },
] as const;

export interface LevelInfo {
  level: number;
  title: string;
  // 현재 직급 시작 경험치 / 다음 직급 경험치 (최고 직급이면 null)
  currentLevelXp: number;
  nextLevelXp: number | null;
  // 다음 직급까지 진행률 0~100 (최고 직급이면 100)
  progress: number;
}

export function levelFor(xp: number): LevelInfo {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].minXp) index = i;
  }
  const current = LEVELS[index];
  const next = LEVELS[index + 1];
  const progress = next
    ? Math.min(100, Math.floor(((xp - current.minXp) / (next.minXp - current.minXp)) * 100))
    : 100;
  return {
    level: current.level,
    title: current.title,
    currentLevelXp: current.minXp,
    nextLevelXp: next ? next.minXp : null,
    progress,
  };
}

export interface StreakState {
  streak: number;
  last_active_date: string | null;
}

// 한국 시간 기준 날짜 (YYYY-MM-DD). offsetDays 로 어제/내일을 구한다.
export function kstDate(now = new Date(), offsetDays = 0): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

// 오늘 활동했을 때의 연속 기록. 같은 날 여러 번 활동해도 하루로 센다.
export function nextStreak(state: StreakState, now = new Date()): number {
  const last = state.last_active_date;
  if (last === kstDate(now)) return Math.max(state.streak, 1);
  if (last === kstDate(now, -1)) return state.streak + 1;
  return 1;
}

// 어제도 오늘도 활동이 없으면 연속 기록은 끊긴 것으로 보여준다. (DB 값은 다음 활동 때 고친다)
export function visibleStreak(state: StreakState, now = new Date()): number {
  const last = state.last_active_date;
  if (last === kstDate(now) || last === kstDate(now, -1)) return state.streak;
  return 0;
}
