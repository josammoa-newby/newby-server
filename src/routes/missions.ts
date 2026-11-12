import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import * as missionGenerationService from '../services/missionGenerationService.js';
import * as missionService from '../services/missionService.js';
import {
  validateMissionCreate,
  validateMissionDateQuery,
  validateMissionDone,
  validateMissionId,
} from '../services/missionValidation.js';

const router = Router();
const generateLimit = rateLimit({ windowMs: 60_000, max: 10 });

// 날짜별 미션 조회 (date 없으면 KST 오늘). 읽기 전용이며 생성은 POST /generate
router.get('/', async (req, res) => {
  const date = validateMissionDateQuery(req.query);
  sendSuccess(res, await missionService.listForDate(req.user!.id, date));
});

// 오늘 미션 자동 생성 (멱등). 이미 있으면 AI 를 부르지 않고 기존 것을 200 으로, 새로 만들면 201.
router.post('/generate', generateLimit, async (req, res) => {
  const { day, created } = await missionGenerationService.generateToday(req.user!.id);
  sendSuccess(res, day, created ? 201 : 200);
});

router.post('/', async (req, res) => {
  const input = validateMissionCreate(req.body);
  sendSuccess(res, await missionService.create(req.user!.id, input), 201);
});

// 완료 체크 / 해제
router.patch('/:id', async (req, res) => {
  const id = validateMissionId(req.params.id);
  const done = validateMissionDone(req.body);
  sendSuccess(res, await missionService.setDone(req.user!.id, id, done));
});

router.delete('/:id', async (req, res) => {
  const id = validateMissionId(req.params.id);
  await missionService.remove(req.user!.id, id);
  sendSuccess(res, { id });
});

export default router;
