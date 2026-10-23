import { applyAdjust, getTypeName } from '../persona/scoring.js';
import { getTopRules } from '../persona/topRules.js';
import type { Answers, Axis, PersonaScores } from '../persona/types.js';
import type { Example } from './supervisorValidation.js';

// 응답에 쓰는 DB 행 (supervisor_profile). user_id 는 조회 조건으로만 쓰고 가져오지 않는다.
export interface SupervisorRow {
  id: string;
  nickname: string;
  position: string | null;
  channel: string;
  mode: 'quick' | 'full';
  answers: Answers;
  scores: PersonaScores;
  score_adjust: Partial<Record<Axis, number>> | null;
  code: string | null;
  catchphrases: string[];
  anger_signals: string | null;
  happy_signals: string | null;
  dislikes: string | null;
  values_text: string | null;
  examples: Example[];
  learned_notes: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const AXES: readonly Axis[] = ['directness', 'control', 'reporting', 'warmth', 'speed', 'stability'];
const NEEDS_CHECK_BELOW = 0.5;

export interface AxisView {
  score: number;
  letter: string;
  strength: string;
  consistency: number;
}

// 최근 피드백으로 점수가 보정된 기록 (applied=true 인 피드백)
export interface Adjustment {
  axis: Axis;
  dir: 1 | -1;
  createdAt: string;
}

export interface SupervisorDetail {
  id: string;
  nickname: string;
  position: string | null;
  channel: string;
  mode: 'quick' | 'full';
  code: string;
  typeName: string | null;
  scores: Record<Axis, AxisView | null>;
  needsCheck: Axis[];
  topRules: string[];
  catchphrases: string[];
  angerSignals: string | null;
  happySignals: string | null;
  dislikes: string | null;
  valuesText: string | null;
  examples: Example[];
  learnedNotes: string[];
  recentAdjustments: Adjustment[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupervisorSummary {
  id: string;
  nickname: string;
  position: string | null;
  channel: string;
  code: string;
  typeName: string | null;
  isDefault: boolean;
  createdAt: string;
}

// score_adjust 가 있으면 보정을 적용한 값을 쓴다.
function effectiveScores(row: Pick<SupervisorRow, 'scores' | 'score_adjust'>): PersonaScores {
  const adjust = row.score_adjust ?? {};
  return Object.keys(adjust).length > 0 ? applyAdjust(row.scores, adjust) : row.scores;
}

export function toDetail(row: SupervisorRow, recentAdjustments: Adjustment[] = []): SupervisorDetail {
  const persona = effectiveScores(row);

  const scores = {} as Record<Axis, AxisView | null>;
  const needsCheck: Axis[] = [];
  for (const axis of AXES) {
    const result = persona[axis];
    if (!result) {
      scores[axis] = null;
      continue;
    }
    scores[axis] = {
      score: result.score,
      letter: result.letter,
      strength: result.strength,
      consistency: result.consistency,
    };
    if (result.consistency < NEEDS_CHECK_BELOW) needsCheck.push(axis);
  }

  return {
    id: row.id,
    nickname: row.nickname,
    position: row.position,
    channel: row.channel,
    mode: row.mode,
    code: persona.code,
    typeName: getTypeName(persona.code)?.typeName ?? null,
    scores,
    needsCheck,
    topRules: getTopRules(persona),
    catchphrases: row.catchphrases,
    angerSignals: row.anger_signals,
    happySignals: row.happy_signals,
    dislikes: row.dislikes,
    valuesText: row.values_text,
    examples: row.examples,
    learnedNotes: row.learned_notes,
    recentAdjustments,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type SupervisorSummaryRow = Pick<
  SupervisorRow,
  'id' | 'nickname' | 'position' | 'channel' | 'scores' | 'score_adjust' | 'is_default' | 'created_at'
>;

export function toSummary(row: SupervisorSummaryRow): SupervisorSummary {
  const { code } = effectiveScores(row);
  return {
    id: row.id,
    nickname: row.nickname,
    position: row.position,
    channel: row.channel,
    code,
    typeName: getTypeName(code)?.typeName ?? null,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}
