import type { MissionDifficulty } from './missionValidation.js';

export interface DefaultMission {
  title: string;
  difficulty: MissionDifficulty;
}

// AI 를 쓸 수 없을 때(분석 없음, AI 오류) 넣는 기본 미션.
export const DEFAULT_MISSIONS: readonly DefaultMission[] = [
  { title: '출근 후 오늘 할 일 3가지 적어보기', difficulty: 'easy' },
  { title: '모르는 것 하나 선배에게 질문하기', difficulty: 'easy' },
  { title: '퇴근 전 오늘 한 일 짧게 정리하기', difficulty: 'easy' },
];

// 가장 최근 일기 분석에 safetyFlag 가 있을 때 쓰는, 마음 돌봄 중심의 기본 미션.
export const CARE_MISSIONS: readonly DefaultMission[] = [
  { title: '오늘 힘든 점 한 줄 적어보기', difficulty: 'easy' },
  { title: '믿을 수 있는 사람에게 안부 물어보기', difficulty: 'easy' },
  { title: '잠깐 산책이나 스트레칭 하기', difficulty: 'easy' },
];

interface Sortable {
  id: string;
  slot: number | null;
  created_at: string;
}

// 미션 정렬: 자동 생성 미션은 slot 순, 직접 만든 미션(slot 없음)은 그 뒤에 만든 순. 시각이 같아도 id 로 순서를 고정한다.
export function compareMissionRows(a: Sortable, b: Sortable): number {
  if (a.slot !== b.slot) {
    if (a.slot === null) return 1;
    if (b.slot === null) return -1;
    return a.slot - b.slot;
  }
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
