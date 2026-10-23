import { getQuestion, getRequiredIds, isSituation } from './questions.js';
import { CORE_AXES } from './types.js';
import type { Answers, Axis, AxisResult, Mode, PersonaScores, Strength } from './types.js';

const AXES: readonly Axis[] = [...CORE_AXES, 'speed', 'stability'];

const LETTERS: Record<Axis, [string, string]> = {
  directness: ['D', 'I'],
  control: ['C', 'A'],
  reporting: ['R', 'P'],
  warmth: ['T', 'W'],
  speed: ['즉시형', '여유형'],
  stability: ['안정형', '기복형'],
};

const SITUATION_WEIGHT = 1.5;
const LIKERT_WEIGHT = 1;
const STRONG_THRESHOLD = 50;
const MILD_THRESHOLD = 20;
const NEEDS_CHECK_BELOW = 0.5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function letterOf(axis: Axis, score: number): string {
  return LETTERS[axis][score >= 0 ? 0 : 1];
}

function strengthOf(score: number): Strength {
  const abs = Math.abs(score);
  if (abs >= STRONG_THRESHOLD) return 'strong';
  if (abs >= MILD_THRESHOLD) return 'mild';
  return 'neutral';
}

function buildCode(scores: Record<Axis, AxisResult | null>): string {
  return CORE_AXES.map((axis) => scores[axis]?.letter ?? '?').join('');
}

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function validateAnswers(answers: unknown, mode: Mode): ValidationResult {
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
    return { ok: false, message: '응답 형식이 올바르지 않아요' };
  }
  const record = answers as Record<string, unknown>;

  for (const id of Object.keys(record)) {
    if (!getQuestion(id)) return { ok: false, message: `알 수 없는 문항이에요: ${id}` };
  }

  for (const id of getRequiredIds(mode)) {
    if (record[id] === undefined) return { ok: false, message: `응답하지 않은 문항이 있어요: ${id}` };
  }

  for (const [id, value] of Object.entries(record)) {
    const question = getQuestion(id)!;
    if (isSituation(question)) {
      if (typeof value !== 'string' || !question.options.some((o) => o.key === value)) {
        return { ok: false, message: `${id} 응답이 올바르지 않아요` };
      }
    } else if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
      return { ok: false, message: `${id} 응답은 1~5 사이 정수여야 해요` };
    }
  }

  return { ok: true };
}

interface Sample {
  score: number;
  weight: number;
}

function collectSamples(answers: Answers): Record<Axis, Sample[]> {
  const samples = Object.fromEntries(AXES.map((axis) => [axis, [] as Sample[]])) as Record<Axis, Sample[]>;

  for (const [id, value] of Object.entries(answers)) {
    const question = getQuestion(id);
    if (!question) continue;

    if (isSituation(question)) {
      const option = question.options.find((o) => o.key === value);
      if (option) samples[question.axis].push({ score: option.score, weight: SITUATION_WEIGHT });
    } else if (typeof value === 'number') {
      const raw = (value - 3) * 50;
      samples[question.axis].push({ score: question.reverse ? -raw : raw, weight: LIKERT_WEIGHT });
    }
  }
  return samples;
}

function scoreAxis(axis: Axis, samples: Sample[]): AxisResult | null {
  if (samples.length === 0) return null;

  const totalWeight = samples.reduce((sum, s) => sum + s.weight, 0);
  const mean = samples.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;
  const variance = samples.reduce((sum, s) => sum + s.weight * (s.score - mean) ** 2, 0) / totalWeight;
  const sd = Math.sqrt(variance);

  const score = Math.round(mean);
  const consistency = Math.round(clamp(1 - sd / 100, 0, 1) * 100) / 100;

  return {
    score,
    letter: letterOf(axis, score),
    strength: strengthOf(score),
    consistency,
    needsCheck: consistency < NEEDS_CHECK_BELOW,
  };
}

export function scorePersona(answers: Answers): PersonaScores {
  const samples = collectSamples(answers);
  const results = Object.fromEntries(AXES.map((axis) => [axis, scoreAxis(axis, samples[axis])])) as Record<
    Axis,
    AxisResult | null
  >;
  return { ...results, code: buildCode(results) };
}

// 피드백 보정용. 보정값을 더해 -100~100 으로 제한하고 letter/strength/code 를 다시 계산한다.
// consistency 와 needsCheck 는 유지하며, 원본은 변경하지 않는다.
export function applyAdjust(scores: PersonaScores, adjust: Partial<Record<Axis, number>>): PersonaScores {
  const results = {} as Record<Axis, AxisResult | null>;
  for (const axis of AXES) {
    const current = scores[axis];
    if (!current) {
      results[axis] = null;
      continue;
    }
    const score = clamp(current.score + (adjust[axis] ?? 0), -100, 100);
    results[axis] = { ...current, score, letter: letterOf(axis, score), strength: strengthOf(score) };
  }
  return { ...results, code: buildCode(results) };
}

const TYPE_NAMES: Record<string, { typeName: string; typeSummary: string }> = {
  DC: { typeName: '레이더형 팀장', typeSummary: '다 보고 있고, 바로 말한다' },
  DA: { typeName: '쿨한 사수', typeSummary: '맡기고, 아니면 아니라고 한다' },
  IC: { typeName: '눈치게임형', typeSummary: '다 보고 있는데, 돌려 말한다' },
  IA: { typeName: '무소식이 희소식형', typeSummary: '말이 없으면 괜찮은 거고, 애매하면 확인해야 한다' },
};

export function getTypeName(code: string): { typeName: string; typeSummary: string } | null {
  return TYPE_NAMES[code.slice(0, 2)] ?? null;
}
