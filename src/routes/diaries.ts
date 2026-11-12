import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import * as diaryAnalysisService from '../services/diaryAnalysisService.js';
import * as diaryService from '../services/diaryService.js';
import {
  validateAnalyzeBody,
  validateDiaryCreate,
  validateDiaryId,
  validateDiaryListQuery,
  validateDiaryPatch,
} from '../services/diaryValidation.js';

const router = Router();

// 사용자당 분당 10회 (저장된 분석을 그대로 돌려주는 요청도 포함)
const analyzeLimit = rateLimit({ windowMs: 60_000, max: 10 });

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

// 일기 AI 분석. 이미 분석돼 있고 일기가 그대로면 저장된 분석을 돌려주고, force:true 면 다시 분석한다.
router.post<{ id: string }>('/:id/analyze', analyzeLimit, async (req, res) => {
  const id = validateDiaryId(req.params.id);
  const { force } = validateAnalyzeBody(req.body);
  sendSuccess(res, await diaryAnalysisService.analyzeDiary(req.user!.id, id, force));
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
