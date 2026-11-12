import { AppError } from '../lib/AppError.js';
import * as missionRepository from '../repositories/missionRepository.js';
import type { MissionRow, NewMission } from '../repositories/missionRepository.js';
import type { MissionCreateInput, MissionDifficulty, MissionSource } from './missionValidation.js';
import * as statsService from './statsService.js';
import type { AwardResult } from './statsService.js';

export interface Mission {
  id: string;
  date: string;
  title: string;
  done: boolean;
  xp: number;
  source: MissionSource;
  reason: string | null;
  difficulty: MissionDifficulty | null;
  createdAt: string;
}

export interface MissionDay {
  date: string;
  missions: Mission[];
  doneCount: number;
  total: number;
  // 그 날의 자동 생성 미션(ai/default)이 이미 있는지. false 면 POST /api/missions/generate 를 부른다.
  generated: boolean;
}

export interface MissionDoneResult {
  mission: Mission;
  // done 값이 실제로 바뀌었는지. (경험치 지급은 xp-streak 에서 이 값으로 중복 지급을 막는다)
  changed: boolean;
  // 경험치 변화 (changed 가 false 면 null). 체크하면 +xp, 해제하면 -xp
  reward: AwardResult | null;
}

export function toMission(row: MissionRow): Mission {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    done: row.done,
    xp: row.xp,
    source: row.source,
    reason: row.reason,
    difficulty: row.difficulty,
    createdAt: row.created_at,
  };
}

export function toDay(date: string, rows: MissionRow[]): MissionDay {
  const missions = rows.map(toMission);
  return {
    date,
    missions,
    doneCount: missions.filter((m) => m.done).length,
    total: missions.length,
    generated: rows.some((r) => r.slot !== null),
  };
}

function notFound(): never {
  throw new AppError(404, 'MISSION_NOT_FOUND', '미션을 찾을 수 없습니다.');
}

export async function listForDate(userId: string, date: string): Promise<MissionDay> {
  // 조회만 한다. 미션 생성은 POST /api/missions/generate (missionGenerationService) 가 맡는다.
  return toDay(date, await missionRepository.listByDate(userId, date));
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
  if (updated) {
    // 실제로 바뀐 경우만 경험치를 준다. 해제하면 같은 만큼 되돌려서 체크/해제 반복으로 경험치를 쌓을 수 없다.
    const reward = await statsService.addXp(userId, done ? updated.xp : -updated.xp);
    return { mission: toMission(updated), changed: true, reward };
  }
  const current = await missionRepository.findOwned(userId, id);
  if (!current) notFound();
  return { mission: toMission(current), changed: false, reward: null };
}

export async function remove(userId: string, id: string): Promise<void> {
  if (!(await missionRepository.deleteOwned(userId, id))) notFound();
}
