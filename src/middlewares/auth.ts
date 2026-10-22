import type { RequestHandler } from 'express';
import { AppError } from '../lib/AppError.js';
import { supabase } from '../lib/supabase.js';

const UNAUTHORIZED = new AppError(401, 'UNAUTHORIZED', '로그인이 필요해요');

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw UNAUTHORIZED;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw UNAUTHORIZED;
  }

  req.user = { id: data.user.id, email: data.user.email };
  next();
};
