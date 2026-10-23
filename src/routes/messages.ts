import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import * as feedbackService from '../services/feedbackService.js';
import { validateFeedback } from '../services/feedbackValidation.js';

const router = Router();

// 사용자당 분당 10회
const feedbackLimit = rateLimit({ windowMs: 60_000, max: 10 });

router.post<{ id: string }>('/:id/feedback', feedbackLimit, async (req, res) => {
  const input = validateFeedback(req.body);
  sendSuccess(res, await feedbackService.submitFeedback(req.user!.id, req.params.id, input));
});

export default router;
