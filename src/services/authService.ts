import { AppError } from '../lib/AppError.js';
import { supabase } from '../lib/supabase.js';
import { supabaseAnon } from '../lib/supabaseAnon.js';
import * as profileRepository from '../repositories/profileRepository.js';
import type { Profile } from '../repositories/profileRepository.js';
import type { LoginInput, RefreshInput, SignupInput } from './authValidation.js';

const INVALID_CREDENTIALS_MESSAGE = '아이디 또는 비밀번호가 올바르지 않아요';
const INVALID_REFRESH_TOKEN_MESSAGE = '세션이 만료됐어요. 다시 로그인해주세요';
const DUPLICATE_USERNAME_MESSAGE = '이미 사용 중인 아이디예요';
const DUPLICATE_EMAIL_MESSAGE = '이미 가입된 이메일이에요';

export interface UserSummary {
  id: string;
  username: string;
  name: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: UserSummary;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  return (await profileRepository.findByUsername(username)) === null;
}

export async function signup(input: SignupInput): Promise<{ user: UserSummary }> {
  if (!(await isUsernameAvailable(input.username))) {
    throw new AppError(409, 'USERNAME_TAKEN', DUPLICATE_USERNAME_MESSAGE);
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    if (error?.code === 'email_exists') {
      throw new AppError(409, 'EMAIL_TAKEN', DUPLICATE_EMAIL_MESSAGE);
    }
    throw error ?? new Error('Auth user creation returned no user');
  }
  const authUser = data.user;

  try {
    await profileRepository.insert({
      id: authUser.id,
      username: input.username,
      name: input.name,
      email: input.email,
      job: input.job,
      workStyle: input.workStyle,
      bossStyle: input.bossStyle,
      marketingAgreed: input.marketingAgreed,
    });
  } catch (err) {
    await rollbackAuthUser(authUser.id);
    if (err instanceof profileRepository.UniqueViolationError) {
      // 사전 확인 이후 동시에 같은 아이디로 가입한 경우
      throw new AppError(409, 'USERNAME_TAKEN', DUPLICATE_USERNAME_MESSAGE);
    }
    throw err;
  }

  return { user: { id: authUser.id, username: input.username, name: input.name } };
}

async function rollbackAuthUser(userId: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    // 고아 Auth 사용자가 남으므로 수동 정리가 필요하다
    console.error(`Failed to roll back auth user ${userId}: ${error.message}`);
  }
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const profile = await profileRepository.findByUsername(input.username);
  if (!profile) {
    throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
  }

  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email: profile.email,
    password: input.password,
  });
  if (error || !data.session) {
    if (error?.code === 'invalid_credentials') {
      throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
    }
    throw error ?? new Error('Sign-in returned no session');
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: { id: profile.id, username: profile.username, name: profile.name },
  };
}

export async function refresh(input: RefreshInput): Promise<LoginResult> {
  const { data, error } = await supabaseAnon.auth.refreshSession({
    refresh_token: input.refreshToken,
  });
  if (error || !data.session || !data.user) {
    // 만료/무효/이미 사용된 토큰은 4xx 로 내려온다. 그 외(네트워크, 5xx)는 서버 에러로 처리
    if (error && error.status !== undefined && error.status >= 400 && error.status < 500) {
      throw new AppError(401, 'UNAUTHORIZED', INVALID_REFRESH_TOKEN_MESSAGE);
    }
    throw error ?? new Error('Refresh returned no session');
  }

  const profile = await profileRepository.findById(data.user.id);
  if (!profile) {
    throw new AppError(404, 'PROFILE_NOT_FOUND', '프로필을 찾을 수 없어요');
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: { id: profile.id, username: profile.username, name: profile.name },
  };
}

export async function getMyProfile(userId: string): Promise<Profile> {
  const profile = await profileRepository.findById(userId);
  if (!profile) {
    throw new AppError(404, 'PROFILE_NOT_FOUND', '프로필을 찾을 수 없어요');
  }
  return profile;
}
