/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock("../../utils/logger", () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock("bull", () => {
  const queues: Record<string, unknown> = {};
  return {
    __esModule: true,
    default: jest.fn((name: string) => {
      queues[name] = queues[name] || {
        add: jest.fn().mockResolvedValue({}),
        getJob: jest.fn(),
        process: jest.fn(),
        on: jest.fn()
      };
      return queues[name];
    })
  };
});
jest.mock("../../models/EmailAccount", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));
jest.mock("../../services/EmailServices/EmailAccessService", () => ({
  emailEnabledForCompany: jest.fn()
}));
jest.mock("../../services/EmailServices/SyncEmailAccountService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/EmailServices/emailRedis", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/EmailServices/ImapIdleManager", () => ({
  __esModule: true,
  default: { start: jest.fn(), refresh: jest.fn(), stop: jest.fn() }
}));
jest.mock("../../services/EmailServices/ProcessEmailSendJob", () => ({
  __esModule: true,
  default: jest.fn()
}));

import "express-async-errors";
import express from "express";
import request from "supertest";
import { OAuth2Client } from "google-auth-library";
import { Op } from "sequelize";
import gmailPushRoutes from "../../routes/gmailPushRoutes";
import {
  GMAIL_PUSH_PATH,
  gmailPushBodyParser
} from "../../controllers/GmailPushController";
import EmailAccount from "../../models/EmailAccount";
import { emailQueue } from "../../queues/email";
import { emailEnabledForCompany } from "../../services/EmailServices/EmailAccessService";
import { logger } from "../../utils/logger";

const AUDIENCE = "https://app.espacowhats.com.br/backend/webhooks/gmail/push";
const SERVICE_ACCOUNT = "gmail-push@espaco.iam.gserviceaccount.com";
const TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";

const Model = EmailAccount as any;
const queue = emailQueue as any;

// Same order as app.ts: the route's small parser first, then the global one.
const app = express();
app.post(GMAIL_PUSH_PATH, gmailPushBodyParser);
app.use(express.json({ limit: "10mb" }));
app.use(gmailPushRoutes);

type Claims = { email?: string; email_verified?: boolean };
let claims: Claims;
let verify: jest.SpyInstance;

const rows = [
  { id: 11, companyId: 1, address: "caixa@gmail.com" },
  { id: 12, companyId: 2, address: "caixa@gmail.com" },
  { id: 13, companyId: 3, address: "caixa@gmail.com" },
  { id: 14, companyId: 4, address: "caixa@gmail.com" },
  { id: 15, companyId: 1, address: "outra@gmail.com" }
];

const envelope = (data: unknown) => ({
  message: {
    data: Buffer.from(
      typeof data === "string" ? data : JSON.stringify(data)
    ).toString("base64"),
    messageId: "2070443601311540",
    publishTime: "2026-10-19T12:00:00.000Z"
  },
  subscription: "projects/espaco/subscriptions/gmail-push"
});

const notification = (emailAddress = "Caixa@Gmail.com") =>
  envelope({ emailAddress, historyId: "9876543210" });

const post = (body: unknown, auth: string | null = `Bearer ${TOKEN}`) => {
  const req = request(app).post(GMAIL_PUSH_PATH);
  if (auth) req.set("Authorization", auth);
  return typeof body === "string"
    ? req.set("Content-Type", "application/json").send(body)
    : req.send(body as object);
};

// The webhook answers before it works: let the background dispatch finish.
const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

const enqueuedJobIds = () =>
  queue.add.mock.calls.map((call: any[]) => call[2].jobId);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GMAIL_PUBSUB_TOPIC = "projects/espaco/topics/gmail-push";
  process.env.GMAIL_PUBSUB_AUDIENCE = AUDIENCE;
  process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT = SERVICE_ACCOUNT;
  delete process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS;
  delete process.env.TENANT_RUNTIME_COMPANY_ID;
  claims = { email: SERVICE_ACCOUNT, email_verified: true };
  verify = jest
    .spyOn(OAuth2Client.prototype, "verifyIdToken")
    .mockImplementation((async ({ idToken }: { idToken: string }) => {
      if (idToken !== TOKEN) throw new Error("Wrong number of segments");
      return { getPayload: () => claims };
    }) as any);
  Model.findAll.mockImplementation(async ({ where }: any) => {
    const [base] = where[Op.and];
    return rows.filter(row => row.address === base.address);
  });
  (emailEnabledForCompany as jest.Mock).mockResolvedValue(true);
});

afterEach(() => {
  verify.mockRestore();
});

afterAll(() => {
  delete process.env.GMAIL_PUBSUB_TOPIC;
  delete process.env.GMAIL_PUBSUB_AUDIENCE;
  delete process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT;
});

describe("POST /webhooks/gmail/push", () => {
  it("rejects missing/invalid OIDC token and wrong service account with 401", async () => {
    const missing = await post(notification(), null);
    expect(missing.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();

    expect((await post(notification(), "Basic abc")).status).toBe(401);
    expect(
      (await post(notification(), "Bearer not-the-token-123456789")).status
    ).toBe(401);

    claims = {
      email: "intruso@evil.iam.gserviceaccount.com",
      email_verified: true
    };
    expect((await post(notification())).status).toBe(401);

    claims = { email: SERVICE_ACCOUNT, email_verified: false };
    expect((await post(notification())).status).toBe(401);

    claims = {};
    expect((await post(notification())).status).toBe(401);

    expect(verify).toHaveBeenCalledWith({ idToken: TOKEN, audience: AUDIENCE });
    // rejections are debug only: unauthenticated callers cannot flood the logs
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      "Rejected Gmail push: invalid or missing OIDC token"
    );
    await settle();
    expect(Model.findAll).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("enqueues sync for every active account with the address and answers 204", async () => {
    const res = await post(notification());
    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    await settle();

    const { where, attributes } = Model.findAll.mock.calls[0][0];
    expect(attributes).toEqual(["id", "companyId"]);
    expect(where[Op.and][0]).toEqual({
      provider: "gmail_api",
      status: "active",
      address: "caixa@gmail.com"
    });
    expect(enqueuedJobIds()).toEqual([
      "sync-11",
      "sync-12",
      "sync-13",
      "sync-14"
    ]);
    expect(queue.add).toHaveBeenCalledWith(
      "EmailSyncAccount",
      { accountId: 11 },
      expect.objectContaining({ removeOnComplete: true, removeOnFail: true })
    );
  });

  it("ignores companies with the channel disabled or not owned by this runtime", async () => {
    process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS = "3";
    (emailEnabledForCompany as jest.Mock).mockImplementation(
      async (companyId: number) => companyId !== 2
    );

    expect((await post(notification())).status).toBe(204);
    await settle();

    const { where } = Model.findAll.mock.calls[0][0];
    expect(where[Op.and][1]).toEqual({ companyId: { [Op.notIn]: [3] } });
    // company 3 is dropped even when the database returns it
    expect(enqueuedJobIds()).toEqual(["sync-11", "sync-14"]);
    expect(emailEnabledForCompany).not.toHaveBeenCalledWith(3);
  });

  it("a company whose channel check fails does not stop the others", async () => {
    (emailEnabledForCompany as jest.Mock).mockImplementation(
      async (companyId: number) => {
        if (companyId === 1) throw new Error("db down");
        return true;
      }
    );
    expect((await post(notification())).status).toBe(204);
    await settle();
    expect(enqueuedJobIds()).toEqual(["sync-12", "sync-13", "sync-14"]);
  });

  it("duplicate notifications enqueue the same jobId", async () => {
    await post(notification());
    await post(notification());
    await settle();
    const ids = enqueuedJobIds();
    expect(ids.filter((id: string) => id === "sync-11")).toHaveLength(2);
    expect(new Set(ids)).toEqual(
      new Set(["sync-11", "sync-12", "sync-13", "sync-14"])
    );
  });

  it("answers 204 to a malformed body, logging no payload", async () => {
    const bodies: unknown[] = [
      {},
      { message: {} },
      { message: { data: 42 } },
      envelope("not json"),
      envelope({ historyId: "1" }),
      envelope({ emailAddress: "no-at-sign" }),
      envelope({ emailAddress: `${"a".repeat(250)}@gmail.com` }),
      "{ invalid json"
    ];
    // eslint-disable-next-line no-restricted-syntax
    for (const body of bodies) {
      const res = await post(body);
      expect(res.status).toBe(204);
      expect(res.text).toBe("");
    }
    await settle();
    expect(Model.findAll).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "Ignored malformed Gmail push notification"
    );
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toMatch(
      /no-at-sign|invalid json|historyId/
    );
  });

  it("still requires the token before looking at a malformed body", async () => {
    expect((await post("{ invalid json", null)).status).toBe(401);
  });

  it("refuses bodies above the route limit with 413", async () => {
    const res = await post({ message: { data: "a".repeat(70 * 1024) } });
    expect(res.status).toBe(413);
    expect(verify).not.toHaveBeenCalled();
  });

  it("does nothing when GMAIL_PUBSUB_TOPIC is not set (404)", async () => {
    delete process.env.GMAIL_PUBSUB_TOPIC;
    expect((await post(notification())).status).toBe(404);
    process.env.GMAIL_PUBSUB_TOPIC = "projects/espaco/topics/gmail-push";
    delete process.env.GMAIL_PUBSUB_AUDIENCE;
    expect((await post(notification())).status).toBe(404);
    process.env.GMAIL_PUBSUB_AUDIENCE = AUDIENCE;
    delete process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT;
    expect((await post(notification())).status).toBe(404);
    await settle();
    expect(verify).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("an enqueue failure for one account does not stop the others", async () => {
    queue.add.mockRejectedValueOnce(new Error("redis down"));
    expect((await post(notification())).status).toBe(204);
    await settle();
    expect(queue.add).toHaveBeenCalledTimes(4);
  });
});
