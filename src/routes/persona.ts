import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import { getPublicQuestions } from '../persona/questions.js';
import { parseMode } from '../services/supervisorValidation.js';

const router = Router();

router.get('/questions', (req, res) => {
  const mode = req.query.mode === undefined ? 'quick' : parseMode(req.query.mode);
  sendSuccess(res, getPublicQuestions(mode));
});

export default router;
