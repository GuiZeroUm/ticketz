import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import isAuth from "../middleware/isAuth";
import * as AgentController from "../controllers/AgentController";

const routes = Router();
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: req => `${req.user.companyId}:${req.user.id}`,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: "ERR_AGENT_RATE_LIMIT" })
});

routes.post("/agent/chat", isAuth, chatLimiter, AgentController.chat);

export default routes;
