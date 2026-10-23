import { AppError } from '../lib/AppError.js';
import * as profileRepository from '../repositories/profileRepository.js';
import type { UserSummary } from './authService.js';
import type { ProfileUpdateInput } from './authValidation.js';

// userId 는 인증된 req.user.id 만 받는다. (service role 이라 RLS 가 막아주지 않는다)
export async function updateMyProfile(
  userId: string,
  input: ProfileUpdateInput,
): Promise<UserSummary> {
  const profile = await profileRepository.updateById(userId, input);
  if (!profile) {
    throw new AppError(404, 'PROFILE_NOT_FOUND', '프로필을 찾을 수 없어요');
  }
  return { id: profile.id, username: profile.username, name: profile.name };
}
