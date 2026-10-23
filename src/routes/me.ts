import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import * as profileService from '../services/profileService.js';
import { validateProfileUpdate } from '../services/authValidation.js';

const router = Router();

router.patch('/', async (req, res) => {
  sendSuccess(
    res,
    await profileService.updateMyProfile(req.user!.id, validateProfileUpdate(req.body)),
  );
});

export default router;
