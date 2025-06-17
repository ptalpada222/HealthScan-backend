import { Router } from "express";
import {
  registerUser,
  loginUser,
  refreshAccessToken,
} from "../controller/user.controller.js";

const router = Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh-token", refreshAccessToken);

export default router;
