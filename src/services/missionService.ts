import { AppError } from '../lib/AppError.js';
import * as missionRepository from '../repositories/missionRepository.js';
import type { MissionRow, NewMission } from '../repositories/missionRepository.js';
import { DEFAULT_XP, todayKst } from './missionValidation.js';
import type { MissionCreateInput } from './missionValidation.js';

export interface Mission {
  id: string;
  date: string;
  title: string;
  done: boolean;
  xp: number;
  createdAt: string;
}

export interface MissionDay {
  date: string;
  missions: Mission[];
  doneCount: number;
  total: number;
}

export interface MissionDoneResult {
  mission: Mission;
  // done 값이 실제로 바뀌었는지. (경험치 지급은 xp-streak 에서 이 값으로 중복 지급을 막는다)
  changed: boolean;
}

// 오늘 미션이 하나도 없을 때 넣는 기본 미션. 일기 AI 분석이 붙으면 그 결과로 미션이 추가된다.
export const DEFAULT_MISSIONS: readonly string[] = [
  '출근 후 오늘 할 일 3가지 적어보기',
  '모르는 것 하나 선배에게 질문하기',
  '퇴근 전 오늘 한 일 짧게 정리하기',
];

function toMission(row: MissionRow): Mission {
  return { id: row.id, date: row.date, title: row.title, done: row.done, xp: row.xp, createdAt: row.created_at };
}

function toDay(date: string, rows: MissionRow[]): MissionDay {
  const missions = rows.map(toMission);
  return { date, missions, doneCount: missions.filter((m) => m.done).length, total: missions.length };
}

function notFound(): never {
  throw new AppError(404, 'MISSION_NOT_FOUND', '미션을 찾을 수 없습니다.');
}

export async function listForDate(userId: string, date: string): Promise<MissionDay> {
  let rows = await missionRepository.listByDate(userId, date);
  // 오늘(KST) 미션이 없으면 기본 미션을 만들어 준다. 지난 날짜는 만들지 않는다.
  if (rows.length === 0 && date === todayKst()) {
    rows = await missionRepository.insertMany(
      userId,
      DEFAULT_MISSIONS.map((title) => ({ date, title, xp: DEFAULT_XP })),
    );
  }
  return toDay(date, rows);
}

// 여러 개를 한 번에 추가한다. (일기 AI 분석에서 미션을 만들 때 재사용)
export async function addMany(userId: string, missions: NewMission[]): Promise<Mission[]> {
  return (await missionRepository.insertMany(userId, missions)).map(toMission);
}

export async function create(userId: string, input: MissionCreateInput): Promise<Mission> {
  const [mission] = await addMany(userId, [input]);
  return mission;
}

export async function setDone(userId: string, id: string, done: boolean): Promise<MissionDoneResult> {
  const updated = await missionRepository.setDoneIfChanged(userId, id, done);
  if (updated) return { mission: toMission(updated), changed: true };
  const current = await missionRepository.findOwned(userId, id);
  if (!current) notFound();
  return { mission: toMission(current), changed: false };
}

export async function remove(userId: string, id: string): Promise<void> {
  if (!(await missionRepository.deleteOwned(userId, id))) notFound();
}
