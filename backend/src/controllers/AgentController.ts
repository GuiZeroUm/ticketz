import { Request, Response } from "express";
import HermesChatService, {
  validateAgentChat
} from "../services/AgentServices/HermesChatService";

export const chat = async (req: Request, res: Response): Promise<void> => {
  const { messages, conversationId } = validateAgentChat(req.body);
  const controller = new AbortController();
  const disconnect = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", disconnect);
  try {
    const reply = await HermesChatService({
      messages,
      conversationId,
      companyId: req.user.companyId,
      userId: String(req.user.id),
      signal: controller.signal
    });
    if (!controller.signal.aborted) res.json({ reply, provider: "hermes" });
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    res.off("close", disconnect);
  }
};
