import { AppError } from '../lib/AppError.js';
import * as diaryRepository from '../repositories/diaryRepository.js';
import type { DiaryRow } from '../repositories/diaryRepository.js';
import type { DiaryCreateInput, DiaryListQuery, DiaryPatchInput } from './diaryValidation.js';
import * as statsService from './statsService.js';
import type { AwardResult } from './statsService.js';

export interface Diary {
  id: string;
  date: string;
  content: string;
  mood: string | null;
  source: 'manual' | 'ai_message';
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDiary(row: DiaryRow): Diary {
  return {
    id: row.id,
    date: row.date,
    content: row.content,
    mood: row.mood,
    source: row.source,
    messageId: row.message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function notFound(): never {
  throw new AppError(404, 'DIARY_NOT_FOUND', '일기를 찾을 수 없습니다.');
}

export interface DiaryCreated extends Diary {
  // 그날 첫 일기면 경험치 지급 결과, 아니면 null
  reward: AwardResult | null;
}

export async function create(userId: string, input: DiaryCreateInput): Promise<DiaryCreated> {
  const diary = toDiary(await diaryRepository.insert({ userId, ...input }));
  // 하루 첫 일기에만 경험치를 준다. (여러 번 써서 경험치를 쌓을 수 없게)
  const isFirstOfDay = (await diaryRepository.countByDate(userId, diary.date)) === 1;
  const reward = isFirstOfDay ? await statsService.addXp(userId, statsService.XP_REWARD.diary) : null;
  return { ...diary, reward };
}

export async function list(userId: string, query: DiaryListQuery): Promise<Diary[]> {
  return (await diaryRepository.listOwned(userId, query)).map(toDiary);
}

export async function get(userId: string, id: string): Promise<Diary> {
  const row = await diaryRepository.findOwned(userId, id);
  if (!row) notFound();
  return toDiary(row);
}

export async function update(userId: string, id: string, patch: DiaryPatchInput): Promise<Diary> {
  const row = await diaryRepository.updateOwned(userId, id, patch);
  if (!row) notFound();
  return toDiary(row);
}

export async function remove(userId: string, id: string): Promise<void> {
  const row = await diaryRepository.findOwned(userId, id);
  if (!row || !(await diaryRepository.deleteOwned(userId, id))) notFound();
  // 그날 일기가 하나도 안 남으면 첫 일기 경험치를 되돌린다. (삭제 후 다시 써서 경험치를 쌓을 수 없게)
  if ((await diaryRepository.countByDate(userId, row.date)) === 0) {
    await statsService.addXp(userId, -statsService.XP_REWARD.diary);
  }
}
