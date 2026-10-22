import { Router } from 'express';
import auth from './auth.js';
import health from './health.js';

const router = Router();

router.use('/health', health);
router.use('/auth', auth);

export default router;
