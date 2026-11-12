import type { DiaryColumns } from '../repositories/diaryRepository.js';
import type { DiaryPatchInput } from './diaryValidation.js';

// API 로 내려가는 일기 분석. generatedAt 은 diaries.analyzed_at 값이다.
export interface DiaryAnalysis {
  summary: string;
  emotion: string;
  strengths: string[];
  growthPoints: string[];
  nextStep: string;
  safetyFlag: boolean;
  model: string;
  generatedAt: string;
}

// diaries.analysis(jsonb)에 저장하는 값
export type StoredAnalysis = Omit<DiaryAnalysis, 'generatedAt'>;

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

// DB 값 -> API 값. 모양이 맞지 않거나 분석 시각이 없으면 null (분석이 없는 것으로 본다)
export function toAnalysis(stored: unknown, analyzedAt: string | null): DiaryAnalysis | null {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored) || !analyzedAt) return null;
  const s = stored as Record<string, unknown>;
  if (
    typeof s.summary !== 'string' ||
    typeof s.emotion !== 'string' ||
    !isStringList(s.strengths) ||
    !isStringList(s.growthPoints) ||
    typeof s.nextStep !== 'string' ||
    typeof s.safetyFlag !== 'boolean' ||
    typeof s.model !== 'string'
  ) {
    return null;
  }
  return {
    summary: s.summary,
    emotion: s.emotion,
    strengths: s.strengths,
    growthPoints: s.growthPoints,
    nextStep: s.nextStep,
    safetyFlag: s.safetyFlag,
    model: s.model,
    generatedAt: analyzedAt,
  };
}

// content 또는 mood 가 실제로 바뀌면 분석은 오래된 것이 된다. (같은 값을 다시 보내면 유지)
export function shouldResetAnalysis(current: { content: string; mood: string | null }, patch: DiaryPatchInput): boolean {
  const contentChanged = patch.content !== undefined && patch.content !== current.content;
  const moodChanged = patch.mood !== undefined && patch.mood !== current.mood;
  return contentChanged || moodChanged;
}

// PATCH 로 쓸 컬럼. 분석이 오래된 것이 되면 analysis 와 analyzed_at 을 같이 비운다.
export function buildPatchColumns(current: { content: string; mood: string | null }, patch: DiaryPatchInput): DiaryColumns {
  return shouldResetAnalysis(current, patch) ? { ...patch, analysis: null, analyzed_at: null } : { ...patch };
}
