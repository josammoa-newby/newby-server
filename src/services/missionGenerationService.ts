import { getOpenAiClient } from '../ai/openai.js';
import * as diaryRepository from '../repositories/diaryRepository.js';
import * as missionRepository from '../repositories/missionRepository.js';
import * as profileRepository from '../repositories/profileRepository.js';
import { generateTodayMissions } from './missionGenerationFlow.js';
import type { GenerateDeps, GenerateResult } from './missionGenerationFlow.js';
import { toDay } from './missionService.js';
import type { MissionDay } from './missionService.js';

// 실제 DB/OpenAI 를 연결한다. 흐름 자체는 missionGenerationFlow.ts (목으로 테스트).
const deps: GenerateDeps = {
  listMissions: missionRepository.listByDate,
  listRecentDiaries: (userId, from, to, limit) => diaryRepository.listOwned(userId, { from, to, limit }),
  async findProfile(userId) {
    const profile = await profileRepository.findById(userId);
    return profile ? { job: profile.job, workStyle: profile.workStyle } : null;
  },
  insertGenerated: missionRepository.insertGenerated,
  getClient: getOpenAiClient,
  now: () => new Date(),
  warn: (message) => console.warn(message),
};

// 같은 사용자의 요청이 겹치면 AI 를 한 번만 부르도록 진행 중인 작업을 공유한다. (이 서버 프로세스 안에서만)
// 여러 인스턴스나 재시작 사이의 중복은 DB 유니크가 막는다.
const inFlight = new Map<string, Promise<GenerateResult>>();

export async function generateToday(userId: string): Promise<{ day: MissionDay; created: boolean }> {
  let pending = inFlight.get(userId);
  const shared = pending !== undefined;
  if (!pending) {
    pending = generateTodayMissions(userId, deps).finally(() => inFlight.delete(userId));
    inFlight.set(userId, pending);
  }
  const result = await pending;
  // 기다리기만 한 요청은 새로 만든 것이 아니다.
  return { day: toDay(result.date, result.rows), created: result.created && !shared };
}
