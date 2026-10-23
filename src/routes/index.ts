import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import auth from './auth.js';
import diaries from './diaries.js';
import health from './health.js';
import me from './me.js';
import messages from './messages.js';
import missions from './missions.js';
import persona from './persona.js';
import sessions from './sessions.js';
import supervisors from './supervisors.js';

const router = Router();

router.use('/health', health);
router.use('/auth', auth);
router.use('/diaries', requireAuth, diaries);
router.use('/missions', requireAuth, missions);
router.use('/me', requireAuth, me);
router.use('/persona', requireAuth, persona);
router.use('/supervisors', requireAuth, supervisors);
router.use('/sessions', requireAuth, sessions);
router.use('/messages', requireAuth, messages);

export default router;
