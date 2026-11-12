import { getOpenAiClient } from '../ai/openai.js';
import * as diaryRepository from '../repositories/diaryRepository.js';
import * as profileRepository from '../repositories/profileRepository.js';
import { analyzeDiary as runAnalyzeDiary } from './diaryAnalysisFlow.js';
import type { AnalyzeDeps, AnalyzeResult } from './diaryAnalysisFlow.js';

// 실제 DB/OpenAI 를 연결한다. 흐름 자체는 diaryAnalysisFlow.ts (목으로 테스트).
const deps: AnalyzeDeps = {
  findDiary: diaryRepository.findOwned,
  async findProfile(userId) {
    const profile = await profileRepository.findById(userId);
    return profile ? { job: profile.job, workStyle: profile.workStyle } : null;
  },
  saveAnalysis: diaryRepository.saveAnalysisIfUnchanged,
  getClient: getOpenAiClient,
  now: () => new Date(),
};

// userId 는 인증된 req.user.id 만 받는다.
export function analyzeDiary(userId: string, id: string, force: boolean): Promise<AnalyzeResult> {
  return runAnalyzeDiary(userId, id, { force }, deps);
}
