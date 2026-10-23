import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import auth from './auth.js';
import diaries from './diaries.js';
import health from './health.js';
import me from './me.js';
import missions from './missions.js';

const router = Router();

router.use('/health', health);
router.use('/auth', auth);
router.use('/diaries', requireAuth, diaries);
router.use('/missions', requireAuth, missions);
router.use('/me', requireAuth, me);

export default router;
