import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import * as profileService from '../services/profileService.js';
import * as statsService from '../services/statsService.js';
import { validateProfileUpdate } from '../services/authValidation.js';

const router = Router();

router.patch('/', async (req, res) => {
  sendSuccess(
    res,
    await profileService.updateMyProfile(req.user!.id, validateProfileUpdate(req.body)),
  );
});

// 경험치 · 직급 · 연속 기록
router.get('/stats', async (req, res) => {
  sendSuccess(res, await statsService.getStats(req.user!.id));
});

export default router;
