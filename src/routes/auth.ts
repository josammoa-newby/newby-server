import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import { requireAuth } from '../middlewares/auth.js';
import * as authService from '../services/authService.js';
import {
  validateLogin,
  validateRefresh,
  validateSignup,
  validateUsername,
} from '../services/authValidation.js';

const router = Router();

router.get('/check-username', async (req, res) => {
  const username = validateUsername(req.query.username);
  sendSuccess(res, { available: await authService.isUsernameAvailable(username) });
});

router.post('/signup', async (req, res) => {
  const result = await authService.signup(validateSignup(req.body));
  sendSuccess(res, result, 201);
});

router.post('/login', async (req, res) => {
  sendSuccess(res, await authService.login(validateLogin(req.body)));
});

router.post('/refresh', async (req, res) => {
  sendSuccess(res, await authService.refresh(validateRefresh(req.body)));
});

router.get('/me', requireAuth, async (req, res) => {
  sendSuccess(res, await authService.getMyProfile(req.user!.id));
});

export default router;
