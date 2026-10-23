import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import * as diaryService from '../services/diaryService.js';
import {
  validateDiaryCreate,
  validateDiaryId,
  validateDiaryListQuery,
  validateDiaryPatch,
} from '../services/diaryValidation.js';

const router = Router();

router.post('/', async (req, res) => {
  const input = validateDiaryCreate(req.body);
  sendSuccess(res, await diaryService.create(req.user!.id, input), 201);
});

router.get('/', async (req, res) => {
  const query = validateDiaryListQuery(req.query);
  sendSuccess(res, await diaryService.list(req.user!.id, query));
});

router.get('/:id', async (req, res) => {
  const id = validateDiaryId(req.params.id);
  sendSuccess(res, await diaryService.get(req.user!.id, id));
});

router.patch('/:id', async (req, res) => {
  const id = validateDiaryId(req.params.id);
  const patch = validateDiaryPatch(req.body);
  sendSuccess(res, await diaryService.update(req.user!.id, id, patch));
});

router.delete('/:id', async (req, res) => {
  const id = validateDiaryId(req.params.id);
  await diaryService.remove(req.user!.id, id);
  sendSuccess(res, { id });
});

export default router;
