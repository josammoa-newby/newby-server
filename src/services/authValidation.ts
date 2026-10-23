import { AppError } from '../lib/AppError.js';

export interface SignupInput {
  name: string;
  username: string;
  email: string;
  password: string;
  marketingAgreed: boolean;
  job: string | null;
  workStyle: string | null;
  bossStyle: string | null;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

const USERNAME_REGEX = /^[a-z0-9_]{4,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 50;
const MAX_EMAIL = 254;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt 한계
const MAX_ANSWER = 100;

function invalid(message: string): never {
  throw new AppError(400, 'VALIDATION_ERROR', message);
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    invalid('요청 본문이 올바르지 않아요');
  }
  return body as Record<string, unknown>;
}

function optionalAnswer(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalid(`${label} 값이 올바르지 않아요`);
  const trimmed = value.trim();
  if (trimmed.length > MAX_ANSWER) invalid(`${label} 값이 너무 길어요`);
  return trimmed === '' ? null : trimmed;
}

export function validateUsername(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    invalid('아이디를 입력해주세요');
  }
  const username = value.trim();
  if (!USERNAME_REGEX.test(username)) {
    invalid('아이디는 영문 소문자, 숫자, 언더스코어(_) 4~20자로 입력해주세요');
  }
  return username;
}

export function validateSignup(body: unknown): SignupInput {
  const b = asObject(body);

  if (typeof b.name !== 'string' || b.name.trim() === '') {
    invalid('이름을 입력해주세요');
  }
  const name = b.name.trim();
  if (name.length > MAX_NAME) invalid(`이름은 ${MAX_NAME}자 이하로 입력해주세요`);

  const username = validateUsername(b.username);

  if (typeof b.email !== 'string' || b.email.trim() === '') {
    invalid('이메일을 입력해주세요');
  }
  const email = b.email.trim().toLowerCase();
  if (email.length > MAX_EMAIL || !EMAIL_REGEX.test(email)) {
    invalid('이메일 형식이 올바르지 않아요');
  }

  if (typeof b.password !== 'string' || b.password.length < MIN_PASSWORD) {
    invalid(`비밀번호는 ${MIN_PASSWORD}자 이상 입력해주세요`);
  }
  if (b.password.length > MAX_PASSWORD) {
    invalid(`비밀번호는 ${MAX_PASSWORD}자 이하로 입력해주세요`);
  }

  if (b.marketingAgreed !== undefined && typeof b.marketingAgreed !== 'boolean') {
    invalid('마케팅 수신 동의 값이 올바르지 않아요');
  }

  return {
    name,
    username,
    email,
    password: b.password,
    marketingAgreed: b.marketingAgreed === true,
    job: optionalAnswer(b.job, '직무'),
    workStyle: optionalAnswer(b.workStyle, '업무 스타일'),
    bossStyle: optionalAnswer(b.bossStyle, '상사 유형'),
  };
}

export function validateLogin(body: unknown): LoginInput {
  const b = asObject(body);
  if (
    typeof b.username !== 'string' ||
    b.username.trim() === '' ||
    typeof b.password !== 'string' ||
    b.password === ''
  ) {
    invalid('아이디와 비밀번호를 입력해주세요');
  }
  return { username: b.username.trim(), password: b.password };
}

export function validateRefresh(body: unknown): RefreshInput {
  const b = asObject(body);
  if (typeof b.refreshToken !== 'string' || b.refreshToken.trim() === '') {
    invalid('refreshToken을 입력해주세요');
  }
  return { refreshToken: b.refreshToken.trim() };
}

// PATCH /api/me 로 수정할 수 있는 프로필 필드. username, id, email, 비밀번호 같은 인증/식별 필드는 포함하지 않는다.
export interface ProfileUpdateInput {
  name?: string;
  job?: string | null;
  workStyle?: string | null;
  bossStyle?: string | null;
  marketingAgreed?: boolean;
}

export const PROFILE_UPDATABLE_FIELDS = ['name', 'job', 'workStyle', 'bossStyle', 'marketingAgreed'] as const;

export function validateProfileUpdate(body: unknown): ProfileUpdateInput {
  const b = asObject(body);

  const rejected = Object.keys(b).filter(
    (key) => !(PROFILE_UPDATABLE_FIELDS as readonly string[]).includes(key),
  );
  if (rejected.length > 0) {
    invalid(`수정할 수 없는 항목이에요: ${rejected.join(', ')}`);
  }
  if (Object.keys(b).length === 0) {
    invalid('수정할 항목을 입력해주세요');
  }

  const update: ProfileUpdateInput = {};

  if ('name' in b) {
    if (typeof b.name !== 'string' || b.name.trim() === '') {
      invalid('이름을 입력해주세요');
    }
    const name = b.name.trim();
    if (name.length > MAX_NAME) invalid(`이름은 ${MAX_NAME}자 이하로 입력해주세요`);
    update.name = name;
  }

  // 선택 항목은 null(또는 빈 문자열)로 보내면 값을 비운다.
  if ('job' in b) update.job = optionalAnswer(b.job, '직무');
  if ('workStyle' in b) update.workStyle = optionalAnswer(b.workStyle, '업무 스타일');
  if ('bossStyle' in b) update.bossStyle = optionalAnswer(b.bossStyle, '상사 유형');

  if ('marketingAgreed' in b) {
    if (typeof b.marketingAgreed !== 'boolean') {
      invalid('마케팅 수신 동의 값이 올바르지 않아요');
    }
    update.marketingAgreed = b.marketingAgreed;
  }

  return update;
}
