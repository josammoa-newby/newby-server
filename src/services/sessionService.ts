import { getGeminiClient } from '../ai/gemini.js';
import type { GeminiClient } from '../ai/gemini.js';
import { askSituation, MAX_HISTORY, summarize } from '../ai/situation.js';
import { AppError } from '../lib/AppError.js';
import * as sessionRepository from '../repositories/sessionRepository.js';
import type { MessageRow, SessionRow } from '../repositories/sessionRepository.js';
import * as supervisorRepository from '../repositories/supervisorRepository.js';
import { isUuid } from './supervisorValidation.js';

export interface SessionView {
  id: string;
  supervisorId: string | null;
  title: string | null;
  createdAt: string;
}

export interface MessageView {
  id: string;
  role: 'user' | 'ai';
  text: string | null;
  payload: unknown;
  createdAt: string;
}

const supervisorNotFound = () => new AppError(404, 'SUPERVISOR_NOT_FOUND', '상사 정보를 찾을 수 없어요');
const sessionNotFound = () => new AppError(404, 'SESSION_NOT_FOUND', '상담 세션을 찾을 수 없어요');

function toSession(row: SessionRow): SessionView {
  return { id: row.id, supervisorId: row.supervisor_id, title: row.title, createdAt: row.created_at };
}

function toMessage(row: MessageRow): MessageView {
  return { id: row.id, role: row.role, text: row.text, payload: row.payload, createdAt: row.created_at };
}

// userId 는 인증된 req.user.id 만 받는다.
async function findMySession(userId: string, id: string): Promise<SessionRow> {
  if (!isUuid(id)) throw sessionNotFound();
  const session = await sessionRepository.findOwnedSession(userId, id);
  if (!session) throw sessionNotFound();
  return session;
}

export async function createSession(
  userId: string,
  supervisorId: string,
): Promise<{ session: SessionView; messages: MessageView[] }> {
  const supervisor = await supervisorRepository.findOwned(userId, supervisorId);
  if (!supervisor) throw supervisorNotFound();

  const session = await sessionRepository.insertSession(userId, supervisor.id, `${supervisor.nickname} 상담`);
  const greeting = await sessionRepository.insertMessage(
    session.id,
    'ai',
    `${supervisor.nickname}이랑 무슨 일 있었어? 상사가 한 말 그대로 적어주면 더 정확해!`,
    null,
  );
  return { session: toSession(session), messages: [toMessage(greeting)] };
}

export async function getSession(
  userId: string,
  id: string,
): Promise<{ session: SessionView; messages: MessageView[] }> {
  const session = await findMySession(userId, id);
  const messages = await sessionRepository.listMessages(session.id);
  return { session: toSession(session), messages: messages.map(toMessage) };
}

// Gemini 호출이 실패해도 user 메시지는 저장된 채로 남는다. 같은 문장으로 다시 보내면 중복 저장된다.
export async function sendMessage(
  userId: string,
  id: string,
  text: string,
  client?: GeminiClient,
): Promise<{ userMessage: MessageView; aiMessage: MessageView }> {
  const session = await findMySession(userId, id);
  if (!session.supervisor_id) throw supervisorNotFound();
  const supervisor = await supervisorRepository.findOwned(userId, session.supervisor_id);
  if (!supervisor) throw supervisorNotFound();

  // 키가 없으면 user 메시지를 저장하기 전에 실패시킨다.
  const gemini = client ?? getGeminiClient();

  const history = await sessionRepository.listRecentMessages(session.id, MAX_HISTORY);
  const userMessage = await sessionRepository.insertMessage(session.id, 'user', text, null);

  const answer = await askSituation({ supervisor, history, userText: text }, gemini);
  const aiMessage = await sessionRepository.insertMessage(session.id, 'ai', summarize(answer), answer);

  return { userMessage: toMessage(userMessage), aiMessage: toMessage(aiMessage) };
}
