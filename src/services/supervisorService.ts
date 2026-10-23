import { AppError } from '../lib/AppError.js';
import { scorePersona } from '../persona/scoring.js';
import * as supervisorRepository from '../repositories/supervisorRepository.js';
import type { SupervisorColumns } from '../repositories/supervisorRepository.js';
import { toDetail, toSummary } from './supervisorMapper.js';
import type { SupervisorDetail, SupervisorSummary } from './supervisorMapper.js';
import { isUuid, planPatch } from './supervisorValidation.js';
import type { SupervisorCreateInput, SupervisorPatchInput } from './supervisorValidation.js';

// userId 는 인증된 req.user.id 만 받는다. 남의 상사, 없는 id, 잘못된 형식은 모두 같은 404 로 답한다.
function notFound(): AppError {
  return new AppError(404, 'SUPERVISOR_NOT_FOUND', '상사 정보를 찾을 수 없어요');
}

export async function create(userId: string, input: SupervisorCreateInput): Promise<SupervisorDetail> {
  const scores = scorePersona(input.answers);
  const row = await supervisorRepository.insert({
    userId,
    nickname: input.nickname,
    position: input.position,
    channel: input.channel,
    mode: input.mode,
    answers: input.answers,
    scores,
    code: scores.code,
    catchphrases: input.catchphrases ?? [],
    angerSignals: input.angerSignals ?? null,
    happySignals: input.happySignals ?? null,
    dislikes: input.dislikes ?? null,
    valuesText: input.valuesText ?? null,
    examples: input.examples ?? [],
  });
  return toDetail(row);
}

export async function list(userId: string): Promise<SupervisorSummary[]> {
  return (await supervisorRepository.listOwned(userId)).map(toSummary);
}

export async function get(userId: string, id: string): Promise<SupervisorDetail> {
  if (!isUuid(id)) throw notFound();
  const row = await supervisorRepository.findOwned(userId, id);
  if (!row) throw notFound();
  return toDetail(row);
}

export async function update(userId: string, id: string, patch: SupervisorPatchInput): Promise<SupervisorDetail> {
  if (!isUuid(id)) throw notFound();
  const existing = await supervisorRepository.findOwned(userId, id);
  if (!existing) throw notFound();

  const plan = planPatch(existing, patch);

  const columns: SupervisorColumns = {};
  if (patch.nickname !== undefined) columns.nickname = patch.nickname;
  if (patch.position !== undefined) columns.position = patch.position;
  if (patch.channel !== undefined) columns.channel = patch.channel;
  if (patch.catchphrases !== undefined) columns.catchphrases = patch.catchphrases;
  if (patch.angerSignals !== undefined) columns.anger_signals = patch.angerSignals;
  if (patch.happySignals !== undefined) columns.happy_signals = patch.happySignals;
  if (patch.dislikes !== undefined) columns.dislikes = patch.dislikes;
  if (patch.valuesText !== undefined) columns.values_text = patch.valuesText;
  if (patch.examples !== undefined) columns.examples = patch.examples;

  // 재채점은 scores/code 만 갱신하고 score_adjust 는 그대로 둔다.
  if (plan.rescore) {
    const scores = scorePersona(plan.answers);
    columns.mode = plan.mode;
    columns.answers = plan.answers;
    columns.scores = scores;
    columns.code = scores.code;
  }

  const row = await supervisorRepository.updateOwned(userId, id, columns);
  if (!row) throw notFound();
  return toDetail(row);
}
