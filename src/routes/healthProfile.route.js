import { Router } from 'express';
import { createOrUpdateHealthProfile } from '../controller/healthProfile.controller.js';

const router = Router();

router.post('/health-profile', createOrUpdateHealthProfile);

export default router;