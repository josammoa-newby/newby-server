import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import * as sessionService from '../services/sessionService.js';
import { validateCreateSession, validateMessage } from '../services/sessionValidation.js';

const router = Router();

// 사용자당 분당 10회
const messageLimit = rateLimit({ windowMs: 60_000, max: 10 });

router.post('/', async (req, res) => {
  const { supervisorId } = validateCreateSession(req.body);
  sendSuccess(res, await sessionService.createSession(req.user!.id, supervisorId), 201);
});

router.post<{ id: string }>('/:id/messages', messageLimit, async (req, res) => {
  const { text } = validateMessage(req.body);
  sendSuccess(res, await sessionService.sendMessage(req.user!.id, req.params.id, text));
});

router.get('/:id', async (req, res) => {
  sendSuccess(res, await sessionService.getSession(req.user!.id, req.params.id));
});

export default router;
