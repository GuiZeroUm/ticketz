import axios from "axios";
import AppError from "../../errors/AppError";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export const validateAgentChat = (
  body: unknown
): { messages: AgentMessage[]; conversationId: string } => {
  const request = body as Record<string, unknown>;
  if (
    !request ||
    typeof request.conversationId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(request.conversationId) ||
    !Array.isArray(request.messages) ||
    !request.messages.length ||
    request.messages.length > 40
  ) {
    throw new AppError("ERR_AGENT_INVALID_REQUEST", 400);
  }
  let total = 0;
  const messages = request.messages.map(message => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > 8000
    ) {
      throw new AppError("ERR_AGENT_INVALID_REQUEST", 400);
    }
    total += message.content.length;
    return { role: message.role, content: message.content } as AgentMessage;
  });
  if (total > 50000 || messages[messages.length - 1].role !== "user") {
    throw new AppError("ERR_AGENT_INVALID_REQUEST", 400);
  }
  return { messages, conversationId: request.conversationId };
};

const activeUsers = new Set<string>();

const HermesChatService = async ({
  messages,
  conversationId,
  companyId,
  userId,
  signal
}: {
  messages: AgentMessage[];
  conversationId: string;
  companyId: number;
  userId: string;
  signal?: AbortSignal;
}): Promise<string> => {
  const baseURL = process.env.HERMES_CHAT_URL?.trim();
  const key = process.env.HERMES_CHAT_BRIDGE_KEY?.trim();
  const allowedCompanies = (process.env.HERMES_CHAT_COMPANY_IDS || "")
    .split(",")
    .map(id => id.trim());
  if (!baseURL || !key || key.length < 32) {
    throw new AppError("ERR_HERMES_NOT_CONFIGURED", 503);
  }
  if (!allowedCompanies.includes(String(companyId))) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }
  try {
    const url = new URL(baseURL);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new Error("Invalid bridge URL");
    }
  } catch {
    throw new AppError("ERR_HERMES_NOT_CONFIGURED", 503);
  }
  const principal = `${companyId}:${userId}`;
  if (activeUsers.has(principal)) throw new AppError("ERR_AGENT_BUSY", 429);
  activeUsers.add(principal);
  try {
    const response = await axios.post(
      `${baseURL.replace(/\/$/, "")}/chat`,
      {
        messages,
        conversationId,
        companyId,
        userId
      },
      {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 150000,
        signal,
        proxy: false,
        maxContentLength: 1024 * 1024,
        maxBodyLength: 256 * 1024
      }
    );
    const reply = response.data?.reply;
    if (typeof reply !== "string" || !reply.trim() || reply.length > 100000) {
      throw new AppError("ERR_HERMES_EMPTY_REPLY", 502);
    }
    return reply;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (signal?.aborted || axios.isCancel(error)) throw error;
    if (axios.isAxiosError(error)) {
      if (["ECONNABORTED", "ETIMEDOUT"].includes(error.code)) {
        throw new AppError("ERR_HERMES_TIMEOUT", 504);
      }
      if (error.response?.status === 429) {
        throw new AppError("ERR_AGENT_BUSY", 429);
      }
    }
    // Do not log transport errors: Axios includes the private bearer key.
    throw new AppError("ERR_HERMES_UNAVAILABLE", 502);
  } finally {
    activeUsers.delete(principal);
  }
};

export default HermesChatService;
