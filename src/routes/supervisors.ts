import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import * as supervisorService from '../services/supervisorService.js';
import { validateSupervisorCreate, validateSupervisorPatch } from '../services/supervisorValidation.js';

const router = Router();

router.post('/', async (req, res) => {
  const input = validateSupervisorCreate(req.body);
  sendSuccess(res, await supervisorService.create(req.user!.id, input), 201);
});

router.get('/', async (req, res) => {
  sendSuccess(res, await supervisorService.list(req.user!.id));
});

router.get('/:id', async (req, res) => {
  sendSuccess(res, await supervisorService.get(req.user!.id, req.params.id));
});

router.patch('/:id', async (req, res) => {
  const patch = validateSupervisorPatch(req.body);
  sendSuccess(res, await supervisorService.update(req.user!.id, req.params.id, patch));
});

export default router;
