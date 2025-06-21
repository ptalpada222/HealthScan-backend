import { Router } from "express";
import {
  upload,
  handleMulterErrors,
} from "../middlewares/multer.middleware.js";
import { analyzeHealthSuitability } from "../controller/healthAnalyze.controller.js";

const router = Router();

router.post(
  "/analyze-health",
  upload.single("foodImage"),
  analyzeHealthSuitability
);


export default router;
