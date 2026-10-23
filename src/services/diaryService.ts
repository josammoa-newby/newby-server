import { AppError } from '../lib/AppError.js';
import * as diaryRepository from '../repositories/diaryRepository.js';
import type { DiaryRow } from '../repositories/diaryRepository.js';
import type { DiaryCreateInput, DiaryListQuery, DiaryPatchInput } from './diaryValidation.js';

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

export async function create(userId: string, input: DiaryCreateInput): Promise<Diary> {
  return toDiary(await diaryRepository.insert({ userId, ...input }));
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
  if (!(await diaryRepository.deleteOwned(userId, id))) notFound();
}
