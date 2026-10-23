export type Axis = 'directness' | 'control' | 'reporting' | 'warmth' | 'speed' | 'stability';

export const CORE_AXES: readonly Axis[] = ['directness', 'control', 'reporting', 'warmth'];

export type Strength = 'strong' | 'mild' | 'neutral';

export type Mode = 'quick' | 'full';

export interface AxisResult {
  // -100 ~ 100
  score: number;
  letter: string;
  strength: Strength;
  // 0 ~ 1
  consistency: number;
  needsCheck: boolean;
}

export type PersonaScores = Record<Axis, AxisResult | null> & { code: string };

// 리커트는 1~5 정수, 상황형은 'a' | 'b' | 'c' | 'd'
export type Answers = Record<string, number | string>;
