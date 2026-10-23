import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import * as missionService from '../services/missionService.js';
import {
  validateMissionCreate,
  validateMissionDateQuery,
  validateMissionDone,
  validateMissionId,
} from '../services/missionValidation.js';

const router = Router();

// 날짜별 미션 (date 없으면 KST 오늘, 오늘 미션이 없으면 기본 미션 생성)
router.get('/', async (req, res) => {
  const date = validateMissionDateQuery(req.query);
  sendSuccess(res, await missionService.listForDate(req.user!.id, date));
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
