/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock("../../middleware/isAuth", () => ({
  __esModule: true,
  default: (req, res, next) => {
    const raw = req.get("x-test-user");
    if (!raw) return res.status(401).json({ error: "ERR_UNAUTHORIZED" });
    req.user = JSON.parse(raw);
    return next();
  }
}));
jest.mock("../../services/EmailServices/EmailAccessService", () => ({
  emailEnabledForCompany: jest.fn(),
  assertEmailEnabled: jest.fn()
}));
jest.mock("../../queues/email", () => ({ enqueueAccountSync: jest.fn() }));
// TicketController pulls the WhatsApp listener, which would open Redis connections
jest.mock("../../libs/cache", () => ({}));
jest.mock("../../queues/campaign", () => ({
  campaignQueue: { add: jest.fn() }
}));
jest.mock("../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn()
}));
jest.mock("../../services/UserServices/ShowUserService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/EmailServices/adapters", () => ({
  ...jest.requireActual("../../services/EmailServices/adapters/errors"),
  testImapSmtp: jest.fn()
}));
jest.mock("../../services/EmailServices/GmailOAuthService", () => ({
  ...jest.requireActual("../../services/EmailServices/GmailOAuthService"),
  StartGmailOAuthService: jest.fn(),
  CompleteGmailOAuthService: jest.fn(),
  FinishGmailOAuthService: jest.fn()
}));
jest.mock("../../services/EmailServices/EmailAttachmentStorage", () => ({
  ...jest.requireActual("../../services/EmailServices/EmailAttachmentStorage"),
  openAttachment: jest.fn()
}));

import "express-async-errors";
import express from "express";
import { Op } from "sequelize";
import request from "supertest";
import { Readable } from "stream";
import { inspect } from "util";
import emailRoutes from "../../routes/emailRoutes";
import isAuth from "../../middleware/isAuth";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import { enqueueAccountSync } from "../../queues/email";
import {
  assertEmailEnabled,
  emailEnabledForCompany
} from "../../services/EmailServices/EmailAccessService";
import {
  EmailAuthError,
  EmailTransientError,
  testImapSmtp
} from "../../services/EmailServices/adapters";
import { openAttachment } from "../../services/EmailServices/EmailAttachmentStorage";
import {
  CompleteGmailOAuthService,
  FinishGmailOAuthService,
  StartGmailOAuthService
} from "../../services/EmailServices/GmailOAuthService";
import { EMAIL_PRESETS } from "../../services/EmailServices/presets";
import ShowUserService from "../../services/UserServices/ShowUserService";
import ListTicketsService from "../../services/TicketServices/ListTicketsService";
import ShowTicketService from "../../services/TicketServices/ShowTicketService";
import * as TicketController from "../../controllers/TicketController";
import { disableEmailAccount } from "../../services/EmailServices/EmailAccountService";
import EmailAccount from "../../models/EmailAccount";
import EmailAttachment from "../../models/EmailAttachment";
import EmailMessage from "../../models/EmailMessage";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";

const app = express();
app.use(express.json());
app.use(emailRoutes);
app.use(
  (
    err: AppError,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => res.status(err.statusCode || 500).json({ error: err.message })
);

const asUser = (
  companyId: number,
  profile = "admin",
  id = companyId * 100
): string => JSON.stringify({ id, companyId, profile });

const emit = jest.fn();
const roomTo = jest.fn();

type FakeAccount = Record<string, any>;

const makeAccount = (overrides: FakeAccount = {}): FakeAccount => {
  const account: FakeAccount = {
    id: 1,
    companyId: 1,
    provider: "imap_smtp",
    preset: "custom",
    name: "Suporte",
    address: "suporte@empresa.com.br",
    status: "active",
    queueId: null,
    lastSyncAt: null,
    lastError: null,
    errorCount: 0,
    imapHost: "imap.empresa.com.br",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.empresa.com.br",
    smtpPort: 465,
    smtpSecure: true,
    updatedAt: new Date("2026-10-19T10:00:00Z"),
    credentials: "ENCRYPTED-SECRET",
    syncCursor: { folders: { INBOX: { uidValidity: "1", lastUid: 99 } } },
    ...overrides
  };
  account.setCredentials = jest.fn((value: unknown) => {
    account.credentials = value ? "ENCRYPTED-NEW" : null;
  });
  account.set = jest.fn((values: FakeAccount) =>
    Object.assign(account, values)
  );
  account.save = jest.fn(async () => account);
  return account;
};

let accounts: FakeAccount[] = [];

const matches = (row: FakeAccount, where: FakeAccount = {}): boolean =>
  Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // { [Op.ne]: "disabled" } style conditions
      const [symbol] = Object.getOwnPropertySymbols(value);
      if (symbol) return row[key] !== (value as any)[symbol];
      return true;
    }
    return row[key] === value;
  });

const secretKeys = ["credentials", "syncCursor"];

beforeEach(() => {
  jest.resetAllMocks();
  accounts = [];
  (emailEnabledForCompany as jest.Mock).mockResolvedValue(true);
  (assertEmailEnabled as jest.Mock).mockResolvedValue(undefined);
  (enqueueAccountSync as jest.Mock).mockResolvedValue(undefined);
  const room = { to: roomTo, emit };
  roomTo.mockReturnValue(room);
  (getIO as jest.Mock).mockReturnValue({ to: roomTo });
  (GetCompanySetting as jest.Mock).mockImplementation(
    async (_companyId, _key, fallback) => fallback
  );
  (testImapSmtp as jest.Mock).mockResolvedValue(undefined);

  jest.spyOn(User, "findByPk").mockImplementation((async (id: number) => ({
    id,
    profile: id === 7 || id === 8 || id === 9 ? "user" : "admin",
    // user 9 was granted the connections screen, 7 only has the defaults
    visibleScreens: id === 9 ? ["connections"] : null,
    queues: id === 8 ? [{ id: 3 }] : []
  })) as any);
  jest
    .spyOn(Queue, "findOne")
    .mockImplementation((async (options: any) =>
      options.where.companyId === 1 && options.where.id === 5
        ? { id: 5 }
        : null) as any);

  const find = async (options: any) =>
    accounts.find(item => matches(item, options.where)) || null;
  jest.spyOn(EmailAccount, "findOne").mockImplementation(find as any);
  jest
    .spyOn(EmailAccount, "findAll")
    .mockImplementation((async (options: any) =>
      accounts.filter(item => matches(item, options.where))) as any);
  jest.spyOn(EmailAccount, "scope").mockReturnValue({
    findOne: find
  } as any);
  jest.spyOn(EmailAccount, "build").mockImplementation(((values: any) => {
    const built = makeAccount({ id: 42, credentials: null, ...values });
    accounts.push(built);
    return built;
  }) as any);
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("email routes", () => {
  describe("availability and the channel switch", () => {
    it("answers availability without asserting the channel", async () => {
      (emailEnabledForCompany as jest.Mock).mockResolvedValue(false);
      const response = await request(app)
        .get("/email/availability")
        .set("x-test-user", asUser(1));
      expect(response.body).toEqual({
        enabled: false,
        gmailConfigured: expect.any(Boolean)
      });
      expect(assertEmailEnabled).not.toHaveBeenCalled();
    });

    describe("gmailConfigured", () => {
      const KEYS = [
        "GMAIL_OAUTH_CLIENT_ID",
        "GMAIL_OAUTH_CLIENT_SECRET",
        "GMAIL_OAUTH_REDIRECT_URI",
        "FRONTEND_URL"
      ];
      const saved: Record<string, string | undefined> = {};
      beforeEach(() => {
        KEYS.forEach(key => {
          saved[key] = process.env[key];
        });
      });
      afterEach(() => {
        KEYS.forEach(key => {
          if (saved[key] === undefined) delete process.env[key];
          else process.env[key] = saved[key];
        });
      });

      const availability = () =>
        request(app).get("/email/availability").set("x-test-user", asUser(1));

      it("is true when the Gmail OAuth variables are set", async () => {
        process.env.GMAIL_OAUTH_CLIENT_ID = "id";
        process.env.GMAIL_OAUTH_CLIENT_SECRET = "secret";
        process.env.GMAIL_OAUTH_REDIRECT_URI =
          "https://dev.espacowhats.com.br/backend/email/oauth/google/callback";
        process.env.FRONTEND_URL = "https://dev.espacowhats.com.br";
        const response = await availability();
        expect(response.body).toEqual({ enabled: true, gmailConfigured: true });
        expect(JSON.stringify(response.body)).not.toContain("secret");
      });

      it("is false when any of them is missing", async () => {
        process.env.GMAIL_OAUTH_CLIENT_ID = "id";
        delete process.env.GMAIL_OAUTH_CLIENT_SECRET;
        process.env.GMAIL_OAUTH_REDIRECT_URI = "https://x/cb";
        process.env.FRONTEND_URL = "https://x";
        const response = await availability();
        expect(response.body).toEqual({
          enabled: true,
          gmailConfigured: false
        });
      });
    });

    it("returns 403 ERR_EMAIL_CHANNEL_DISABLED on every email route when disabled", async () => {
      (assertEmailEnabled as jest.Mock).mockRejectedValue(
        new AppError("ERR_EMAIL_CHANNEL_DISABLED", 403)
      );
      const calls = [
        (u: string) =>
          request(app).get("/email/accounts").set("x-test-user", u),
        (u: string) =>
          request(app)
            .post("/email/accounts/test")
            .set("x-test-user", u)
            .send({}),
        (u: string) =>
          request(app).post("/email/accounts").set("x-test-user", u).send({}),
        (u: string) =>
          request(app).put("/email/accounts/1").set("x-test-user", u).send({}),
        (u: string) =>
          request(app).delete("/email/accounts/1").set("x-test-user", u),
        (u: string) =>
          request(app).post("/email/accounts/1/sync").set("x-test-user", u),
        (u: string) =>
          request(app).get("/email/tickets/1/thread").set("x-test-user", u),
        (u: string) =>
          request(app).get("/email/attachments/1").set("x-test-user", u)
      ];
      // eslint-disable-next-line no-restricted-syntax
      for (const call of calls) {
        const response = await call(asUser(1));
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: "ERR_EMAIL_CHANNEL_DISABLED" });
      }
      expect(testImapSmtp).not.toHaveBeenCalled();
      expect(enqueueAccountSync).not.toHaveBeenCalled();
    });

    it("keeps account management admin-only", async () => {
      const response = await request(app)
        .post("/email/accounts")
        .set("x-test-user", asUser(1, "user", 7))
        .send({ preset: "icloud", address: "a@icloud.com", password: "x" });
      expect(response.status).toBe(403);
      expect(testImapSmtp).not.toHaveBeenCalled();
    });
  });

  describe("screen access", () => {
    it("lets a user with the connections screen list accounts but not change them", async () => {
      accounts = [makeAccount()];
      const user = asUser(1, "user", 9);
      const list = await request(app)
        .get("/email/accounts")
        .set("x-test-user", user);
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);

      const calls = [
        request(app).post("/email/accounts/test").set("x-test-user", user),
        request(app).post("/email/accounts").set("x-test-user", user),
        request(app).put("/email/accounts/1").set("x-test-user", user),
        request(app).delete("/email/accounts/1").set("x-test-user", user),
        request(app).post("/email/accounts/1/sync").set("x-test-user", user)
      ];
      const responses = await Promise.all(calls.map(call => call.send({})));
      responses.forEach(response => expect(response.status).toBe(403));
      expect(testImapSmtp).not.toHaveBeenCalled();
      expect(enqueueAccountSync).not.toHaveBeenCalled();
    });

    it("refuses the account list to a user without the connections screen", async () => {
      const response = await request(app)
        .get("/email/accounts")
        .set("x-test-user", asUser(1, "user", 7));
      expect(response.status).toBe(403);
    });
  });

  describe("accounts", () => {
    it("lists the company accounts without credentials or cursor", async () => {
      accounts = [
        makeAccount({ id: 1, companyId: 1 }),
        makeAccount({ id: 2, companyId: 2, address: "outra@b.com" })
      ];
      const response = await request(app)
        .get("/email/accounts")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: 1,
        address: "suporte@empresa.com.br",
        status: "active"
      });
      const serialized = JSON.stringify(response.body);
      secretKeys.forEach(key => expect(serialized).not.toContain(key));
      expect(serialized).not.toContain("ENCRYPTED-SECRET");
      expect(EmailAccount.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 1 })
        })
      );
    });

    it("tests a connection and answers 204", async () => {
      const response = await request(app)
        .post("/email/accounts/test")
        .set("x-test-user", asUser(1))
        .send({
          preset: "custom",
          address: "Suporte@Empresa.com.br",
          password: "s3cret",
          imap: { host: "imap.empresa.com.br", port: 993, secure: true },
          smtp: { host: "smtp.empresa.com.br", port: 465, secure: true }
        });
      expect(response.status).toBe(204);
      expect(testImapSmtp).toHaveBeenCalledWith({
        address: "suporte@empresa.com.br",
        password: "s3cret",
        imap: { host: "imap.empresa.com.br", port: 993, secure: true },
        smtp: { host: "smtp.empresa.com.br", port: 465, secure: true }
      });
    });

    it.each([
      ["auth failure", new EmailAuthError(), "ERR_EMAIL_AUTH_FAILED"],
      [
        "unexpected server text",
        new Error("535 user bob@x.com token=abc123 rejected"),
        "ERR_EMAIL_CONNECTION_FAILED"
      ],
      [
        "transient error",
        new EmailTransientError("ERR_EMAIL_TRANSIENT", "ECONNREFUSED"),
        "ERR_EMAIL_CONNECTION_FAILED"
      ],
      [
        "blocked host",
        new AppError("ERR_EMAIL_HOST_NOT_ALLOWED", 400),
        "ERR_EMAIL_HOST_NOT_ALLOWED"
      ],
      [
        "adapter AppError with free text",
        new AppError("connect to 10.0.0.1 failed: secret", 400),
        "ERR_EMAIL_CONNECTION_FAILED"
      ]
    ])("maps %s to a fixed ERR_EMAIL_* code", async (_name, error, code) => {
      (testImapSmtp as jest.Mock).mockRejectedValue(error);
      const response = await request(app)
        .post("/email/accounts/test")
        .set("x-test-user", asUser(1))
        .send({
          preset: "icloud",
          address: "a@icloud.com",
          password: "pw"
        });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: code });
    });

    it.each([
      [
        "gmail preset",
        { preset: "gmail", address: "a@gmail.com", password: "x" }
      ],
      ["missing password", { preset: "icloud", address: "a@icloud.com" }],
      ["invalid address", { preset: "icloud", address: "nope", password: "x" }],
      [
        "custom without hosts",
        { preset: "custom", address: "a@b.com", password: "x" }
      ],
      [
        "custom with bad port",
        {
          preset: "custom",
          address: "a@b.com",
          password: "x",
          imap: { host: "imap.b.com", port: "abc", secure: true },
          smtp: { host: "smtp.b.com", port: 465, secure: true }
        }
      ]
    ])("rejects an invalid test body (%s)", async (_name, body) => {
      const response = await request(app)
        .post("/email/accounts/test")
        .set("x-test-user", asUser(1))
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/^ERR_EMAIL_/);
      expect(testImapSmtp).not.toHaveBeenCalled();
    });

    it("creates an icloud account using presets even if client sends other hosts", async () => {
      const response = await request(app)
        .post("/email/accounts")
        .set("x-test-user", asUser(1))
        .send({
          preset: "icloud",
          name: "iCloud",
          address: "pessoa@icloud.com",
          password: "app-password",
          imap: { host: "attacker.example.com", port: 143, secure: false },
          smtp: { host: "169.254.169.254", port: 25, secure: false }
        });
      expect(response.status).toBe(201);
      expect(testImapSmtp).toHaveBeenCalledWith({
        address: "pessoa@icloud.com",
        password: "app-password",
        imap: EMAIL_PRESETS.icloud.imap,
        smtp: EMAIL_PRESETS.icloud.smtp
      });
      expect(EmailAccount.build).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 1,
          provider: "imap_smtp",
          preset: "icloud",
          status: "active",
          imapHost: "imap.mail.me.com",
          imapPort: 993,
          imapSecure: true,
          smtpHost: "smtp.mail.me.com",
          smtpPort: 587,
          smtpSecure: false,
          connectedByUserId: 100
        })
      );
      const saved = accounts[0];
      expect(saved.setCredentials).toHaveBeenCalledWith({
        password: "app-password"
      });
      expect(saved.save).toHaveBeenCalled();
      expect(enqueueAccountSync).toHaveBeenCalledWith(42);
      expect(response.body).toMatchObject({
        id: 42,
        preset: "icloud",
        status: "active"
      });
      expect(JSON.stringify(response.body)).not.toContain("app-password");
      expect(JSON.stringify(response.body)).not.toContain("credentials");
      expect(roomTo).toHaveBeenCalledWith("company-1-admin");
      expect(emit).toHaveBeenCalledWith(
        "company-1-emailAccount",
        expect.objectContaining({
          action: "create",
          account: expect.objectContaining({ id: 42 })
        })
      );
    });

    describe("without ENCRYPTION_KEY", () => {
      const savedKey = process.env.ENCRYPTION_KEY;
      beforeEach(() => {
        delete process.env.ENCRYPTION_KEY;
      });
      afterEach(() => {
        if (savedKey === undefined) delete process.env.ENCRYPTION_KEY;
        else process.env.ENCRYPTION_KEY = savedKey;
      });

      it("refuses to create a mailbox with ERR_EMAIL_ENCRYPTION_NOT_CONFIGURED", async () => {
        const response = await request(app)
          .post("/email/accounts")
          .set("x-test-user", asUser(1))
          .send({
            preset: "icloud",
            address: "pessoa@icloud.com",
            password: "app-password"
          });
        expect(response.status).toBe(503);
        expect(response.body).toEqual({
          error: "ERR_EMAIL_ENCRYPTION_NOT_CONFIGURED"
        });
        expect(testImapSmtp).not.toHaveBeenCalled();
        expect(accounts).toHaveLength(0);
      });

      it("refuses a new password, but still saves name and queue changes", async () => {
        const account = makeAccount();
        accounts = [account];
        const refused = await request(app)
          .put("/email/accounts/1")
          .set("x-test-user", asUser(1))
          .send({ password: "new-password" });
        expect(refused.status).toBe(503);
        expect(refused.body).toEqual({
          error: "ERR_EMAIL_ENCRYPTION_NOT_CONFIGURED"
        });
        expect(testImapSmtp).not.toHaveBeenCalled();
        expect(account.setCredentials).not.toHaveBeenCalled();

        const renamed = await request(app)
          .put("/email/accounts/1")
          .set("x-test-user", asUser(1))
          .send({ name: "Novo nome" });
        expect(renamed.status).toBe(200);
      });
    });

    it("creates a custom account with the validated endpoints", async () => {
      const response = await request(app)
        .post("/email/accounts")
        .set("x-test-user", asUser(1))
        .send({
          preset: "custom",
          name: "Suporte",
          address: "suporte@empresa.com.br",
          password: "pw",
          queueId: 5,
          imap: { host: "imap.empresa.com.br", port: 993, secure: true },
          smtp: { host: "smtp.empresa.com.br", port: 587, secure: false }
        });
      expect(response.status).toBe(201);
      expect(EmailAccount.build).toHaveBeenCalledWith(
        expect.objectContaining({
          preset: "custom",
          queueId: 5,
          imapHost: "imap.empresa.com.br",
          smtpPort: 587,
          smtpSecure: false
        })
      );
    });

    it("does not create the account when the test fails", async () => {
      (testImapSmtp as jest.Mock).mockRejectedValue(new EmailAuthError());
      const response = await request(app)
        .post("/email/accounts")
        .set("x-test-user", asUser(1))
        .send({ preset: "icloud", address: "a@icloud.com", password: "bad" });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "ERR_EMAIL_AUTH_FAILED" });
      expect(EmailAccount.build).not.toHaveBeenCalled();
      expect(enqueueAccountSync).not.toHaveBeenCalled();
    });

    it("rejects a queueId from another company", async () => {
      const response = await request(app)
        .post("/email/accounts")
        .set("x-test-user", asUser(2))
        .send({
          preset: "icloud",
          name: "X",
          address: "a@icloud.com",
          password: "pw",
          queueId: 5
        });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "ERR_QUEUE_NOT_FOUND" });
      expect(testImapSmtp).not.toHaveBeenCalled();
      expect(EmailAccount.build).not.toHaveBeenCalled();
    });

    it("rejects a second active account with the same address", async () => {
      accounts = [makeAccount({ address: "pessoa@icloud.com" })];
      const response = await request(app)
        .post("/email/accounts")
        .set("x-test-user", asUser(1))
        .send({
          preset: "icloud",
          name: "Dup",
          address: "Pessoa@iCloud.com",
          password: "pw"
        });
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: "ERR_EMAIL_ACCOUNT_EXISTS" });
      expect(EmailAccount.build).not.toHaveBeenCalled();
    });

    it("reconnects a disabled account with the same address instead of failing on the unique index", async () => {
      const old = makeAccount({
        id: 9,
        address: "pessoa@icloud.com",
        status: "disabled",
        credentials: null,
        syncCursor: null,
        scopes: ["stale-scope"]
      });
      accounts = [old];
      const response = await request(app)
        .post("/email/accounts")
        .set("x-test-user", asUser(1))
        .send({
          preset: "icloud",
          name: "Nova",
          address: "pessoa@icloud.com",
          password: "new-pw"
        });
      expect(response.status).toBe(201);
      expect(EmailAccount.build).not.toHaveBeenCalled();
      expect(old.setCredentials).toHaveBeenCalledWith({ password: "new-pw" });
      expect(old.status).toBe("active");
      expect(old.name).toBe("Nova");
      expect(old.syncCursor).toBeNull();
      expect(old.scopes).toEqual([]);
      expect(enqueueAccountSync).toHaveBeenCalledWith(9);
    });

    it("does not reuse a disabled account of another provider", async () => {
      const old = makeAccount({
        id: 9,
        provider: "gmail_api",
        preset: "gmail",
        address: "pessoa@icloud.com",
        status: "disabled",
        credentials: null
      });
      accounts = [old];
      const response = await request(app)
        .post("/email/accounts")
        .set("x-test-user", asUser(1))
        .send({
          preset: "icloud",
          name: "Nova",
          address: "pessoa@icloud.com",
          password: "pw"
        });
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: "ERR_EMAIL_ACCOUNT_EXISTS" });
      expect(testImapSmtp).not.toHaveBeenCalled();
      expect(old.save).not.toHaveBeenCalled();
      expect(old.provider).toBe("gmail_api");
      expect(enqueueAccountSync).not.toHaveBeenCalled();
    });

    it("company B gets 404 for a company A account on update, delete and sync", async () => {
      accounts = [makeAccount({ id: 1, companyId: 1 })];
      const user = asUser(2);
      const put = await request(app)
        .put("/email/accounts/1")
        .set("x-test-user", user)
        .send({ name: "hack" });
      const del = await request(app)
        .delete("/email/accounts/1")
        .set("x-test-user", user);
      const sync = await request(app)
        .post("/email/accounts/1/sync")
        .set("x-test-user", user);
      [put, del, sync].forEach(response => {
        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "ERR_EMAIL_ACCOUNT_NOT_FOUND" });
      });
      expect(accounts[0].save).not.toHaveBeenCalled();
      expect(enqueueAccountSync).not.toHaveBeenCalled();
    });

    it("updates name and queue without retesting the connection", async () => {
      const account = makeAccount();
      accounts = [account];
      const response = await request(app)
        .put("/email/accounts/1")
        .set("x-test-user", asUser(1))
        .send({ name: "Novo nome", queueId: 5 });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: 1,
        name: "Novo nome",
        queueId: 5
      });
      expect(testImapSmtp).not.toHaveBeenCalled();
      expect(account.setCredentials).not.toHaveBeenCalled();
      expect(account.save).toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith(
        "company-1-emailAccount",
        expect.objectContaining({ action: "update" })
      );
    });

    it("clears the queue when queueId is null", async () => {
      accounts = [makeAccount({ queueId: 5 })];
      const response = await request(app)
        .put("/email/accounts/1")
        .set("x-test-user", asUser(1))
        .send({ name: "Suporte", queueId: null });
      expect(response.status).toBe(200);
      expect(response.body.queueId).toBeNull();
    });

    it("rejects a queueId from another company on update", async () => {
      accounts = [makeAccount({ id: 1, companyId: 2 })];
      const response = await request(app)
        .put("/email/accounts/1")
        .set("x-test-user", asUser(2))
        .send({ queueId: 5 });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "ERR_QUEUE_NOT_FOUND" });
    });

    it("a new password is tested again, stored encrypted and brings the account back to active", async () => {
      const account = makeAccount({
        status: "reauth_required",
        errorCount: 3,
        lastError: { code: "ERR_EMAIL_AUTH", at: "2026-10-19T09:00:00Z" }
      });
      accounts = [account];
      const response = await request(app)
        .put("/email/accounts/1")
        .set("x-test-user", asUser(1))
        .send({ password: "new-password" });
      expect(response.status).toBe(200);
      expect(testImapSmtp).toHaveBeenCalledWith({
        address: "suporte@empresa.com.br",
        password: "new-password",
        imap: { host: "imap.empresa.com.br", port: 993, secure: true },
        smtp: { host: "smtp.empresa.com.br", port: 465, secure: true }
      });
      expect(account.setCredentials).toHaveBeenCalledWith({
        password: "new-password"
      });
      expect(account.status).toBe("active");
      expect(account.errorCount).toBe(0);
      expect(account.lastError).toBeNull();
      expect(enqueueAccountSync).toHaveBeenCalledWith(1);
      expect(response.body.status).toBe("active");
      expect(JSON.stringify(response.body)).not.toContain("new-password");
    });

    it("keeps the old credentials when the new password fails the test", async () => {
      const account = makeAccount({ status: "reauth_required" });
      accounts = [account];
      (testImapSmtp as jest.Mock).mockRejectedValue(new EmailAuthError());
      const response = await request(app)
        .put("/email/accounts/1")
        .set("x-test-user", asUser(1))
        .send({ password: "wrong" });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "ERR_EMAIL_AUTH_FAILED" });
      expect(account.setCredentials).not.toHaveBeenCalled();
      expect(account.save).not.toHaveBeenCalled();
      expect(account.status).toBe("reauth_required");
    });

    it("uses the icloud presets when retesting an icloud account", async () => {
      accounts = [
        makeAccount({
          preset: "icloud",
          imapHost: "stored.example.com",
          smtpHost: "stored.example.com"
        })
      ];
      await request(app)
        .put("/email/accounts/1")
        .set("x-test-user", asUser(1))
        .send({ password: "pw" });
      expect(testImapSmtp).toHaveBeenCalledWith(
        expect.objectContaining({
          imap: EMAIL_PRESETS.icloud.imap,
          smtp: EMAIL_PRESETS.icloud.smtp
        })
      );
    });

    it("refuses a password on an OAuth account", async () => {
      accounts = [makeAccount({ provider: "gmail_api", preset: "gmail" })];
      const response = await request(app)
        .put("/email/accounts/1")
        .set("x-test-user", asUser(1))
        .send({ password: "pw" });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "ERR_EMAIL_PROVIDER_NOT_SUPPORTED"
      });
    });

    it("DELETE wipes credentials, sets disabled and keeps tickets", async () => {
      const account = makeAccount();
      accounts = [account];
      const ticketUpdate = jest.spyOn(Ticket, "update");
      const ticketDestroy = jest.spyOn(Ticket, "destroy");
      const response = await request(app)
        .delete("/email/accounts/1")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(204);
      expect(account.setCredentials).toHaveBeenCalledWith(null);
      expect(account.credentials).toBeNull();
      expect(account.syncCursor).toBeNull();
      expect(account.status).toBe("disabled");
      expect(account.save).toHaveBeenCalled();
      expect(ticketUpdate).not.toHaveBeenCalled();
      expect(ticketDestroy).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith(
        "company-1-emailAccount",
        expect.objectContaining({
          action: "delete",
          account: expect.objectContaining({ id: 1, status: "disabled" })
        })
      );
    });

    it("DELETE on an already disabled account is a quiet no-op", async () => {
      const account = makeAccount({ status: "disabled", credentials: null });
      accounts = [account];
      const response = await request(app)
        .delete("/email/accounts/1")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(204);
      expect(account.save).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it("exports disableEmailAccount for the provider tasks to extend", async () => {
      const account = makeAccount();
      await disableEmailAccount(account as unknown as EmailAccount);
      expect(account.status).toBe("disabled");
      expect(account.credentials).toBeNull();
    });

    it("POST sync enqueues a sync and answers 202", async () => {
      accounts = [makeAccount()];
      const response = await request(app)
        .post("/email/accounts/1/sync")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(202);
      expect(enqueueAccountSync).toHaveBeenCalledWith(1);
    });

    it("POST sync maps an enqueue failure to a fixed code", async () => {
      accounts = [makeAccount()];
      (enqueueAccountSync as jest.Mock).mockRejectedValue(
        new Error("redis://:secret@10.0.0.1 ECONNREFUSED")
      );
      const response = await request(app)
        .post("/email/accounts/1/sync")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: "ERR_EMAIL_SYNC_ENQUEUE_FAILED" });
    });

    it("POST sync refuses an account that cannot sync", async () => {
      accounts = [makeAccount({ status: "reauth_required" })];
      const response = await request(app)
        .post("/email/accounts/1/sync")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: "ERR_EMAIL_ACCOUNT_UNAVAILABLE" });
      expect(enqueueAccountSync).not.toHaveBeenCalled();
    });

    it("answers 404 for a malformed account id", async () => {
      const response = await request(app)
        .put("/email/accounts/abc")
        .set("x-test-user", asUser(1))
        .send({});
      expect(response.status).toBe(404);
    });
  });

  describe("gmail oauth", () => {
    beforeEach(() => {
      (StartGmailOAuthService as jest.Mock).mockResolvedValue({
        url: "https://accounts.google.com/o/oauth2/v2/auth?state=s"
      });
      (CompleteGmailOAuthService as jest.Mock).mockResolvedValue({
        redirectTo:
          "https://teste.espacowhats.com.br/connections#email=pending&handle=h"
      });
    });

    it("POST start asserts the channel and answers only the Google URL", async () => {
      const response = await request(app)
        .post("/email/oauth/google/start")
        .set("x-test-user", asUser(1))
        .set("Origin", "https://teste.espacowhats.com.br")
        .send({ name: "Suporte", queueId: 5, accountId: 9 });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        url: "https://accounts.google.com/o/oauth2/v2/auth?state=s"
      });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(assertEmailEnabled).toHaveBeenCalledWith(1);
      expect(StartGmailOAuthService).toHaveBeenCalledWith({
        companyId: 1,
        userId: 100,
        name: "Suporte",
        queueId: 5,
        accountId: 9,
        origin: "https://teste.espacowhats.com.br"
      });
    });

    it("POST start falls back to the Referer origin", async () => {
      await request(app)
        .post("/email/oauth/google/start")
        .set("x-test-user", asUser(1))
        .set("Referer", "https://teste.espacowhats.com.br/connections?x=1")
        .send({});
      expect(StartGmailOAuthService).toHaveBeenCalledWith(
        expect.objectContaining({ origin: "https://teste.espacowhats.com.br" })
      );
    });

    it("POST start is refused when the channel is disabled or the user is not an admin", async () => {
      (assertEmailEnabled as jest.Mock).mockRejectedValue(
        new AppError("ERR_EMAIL_CHANNEL_DISABLED", 403)
      );
      const disabled = await request(app)
        .post("/email/oauth/google/start")
        .set("x-test-user", asUser(1))
        .send({});
      expect(disabled.status).toBe(403);
      expect(disabled.body).toEqual({ error: "ERR_EMAIL_CHANNEL_DISABLED" });

      (assertEmailEnabled as jest.Mock).mockResolvedValue(undefined);
      const notAdmin = await request(app)
        .post("/email/oauth/google/start")
        .set("x-test-user", asUser(1, "user", 9))
        .send({});
      expect(notAdmin.status).toBe(403);
      const anonymous = await request(app)
        .post("/email/oauth/google/start")
        .send({});
      expect(anonymous.status).toBe(401);
      expect(StartGmailOAuthService).not.toHaveBeenCalled();
    });

    it("POST finish passes the handle with the caller's company and user and answers the account", async () => {
      (FinishGmailOAuthService as jest.Mock).mockResolvedValue({
        id: 42,
        address: "caixa@gmail.com",
        provider: "gmail_api",
        status: "active"
      });
      const response = await request(app)
        .post("/email/oauth/google/finish")
        .set("x-test-user", asUser(1))
        .send({ handle: "h4ndle" });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 42,
        address: "caixa@gmail.com",
        provider: "gmail_api",
        status: "active"
      });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(assertEmailEnabled).toHaveBeenCalledWith(1);
      expect(FinishGmailOAuthService).toHaveBeenCalledWith({
        handle: "h4ndle",
        companyId: 1,
        userId: 100
      });
    });

    it("POST finish needs a logged-in admin and an enabled channel", async () => {
      const anonymous = await request(app)
        .post("/email/oauth/google/finish")
        .send({ handle: "h" });
      expect(anonymous.status).toBe(401);
      const notAdmin = await request(app)
        .post("/email/oauth/google/finish")
        .set("x-test-user", asUser(1, "user", 9))
        .send({ handle: "h" });
      expect(notAdmin.status).toBe(403);
      (assertEmailEnabled as jest.Mock).mockRejectedValue(
        new AppError("ERR_EMAIL_CHANNEL_DISABLED", 403)
      );
      const disabled = await request(app)
        .post("/email/oauth/google/finish")
        .set("x-test-user", asUser(1))
        .send({ handle: "h" });
      expect(disabled.body).toEqual({ error: "ERR_EMAIL_CHANNEL_DISABLED" });
      expect(FinishGmailOAuthService).not.toHaveBeenCalled();
    });

    it("GET callback needs no auth and answers a 302 to the service redirect", async () => {
      const response = await request(app).get(
        "/email/oauth/google/callback?code=c0de&state=st4te&scope=x"
      );
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(
        "https://teste.espacowhats.com.br/connections#email=pending&handle=h"
      );
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(CompleteGmailOAuthService).toHaveBeenCalledWith({
        code: "c0de",
        state: "st4te",
        error: undefined
      });
      expect(assertEmailEnabled).not.toHaveBeenCalled();
    });

    it("GET callback still redirects when the service throws", async () => {
      (CompleteGmailOAuthService as jest.Mock).mockRejectedValue(
        new Error("boom")
      );
      process.env.FRONTEND_URL = "https://app.espacowhats.com.br";
      const response = await request(app).get(
        "/email/oauth/google/callback?error=access_denied&state=s"
      );
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(
        "https://app.espacowhats.com.br/connections#email=error&code=ERR_GMAIL_OAUTH_FAILED"
      );
    });
  });

  describe("thread", () => {
    const ticket = (overrides: FakeAccount = {}) => ({
      id: 10,
      companyId: 1,
      channel: "email",
      status: "open",
      queueId: 3,
      subject: "Orçamento",
      emailAccountId: 1,
      unreadMessages: 2,
      ...overrides
    });

    const emailMessages = () => [
      {
        id: 1,
        messageId: "m-in",
        direction: "in",
        fromAddress: { name: "Cliente", address: "cliente@x.com" },
        toAddresses: [{ address: "suporte@empresa.com.br" }],
        ccAddresses: [],
        receivedAt: new Date("2026-10-19T10:00:00Z"),
        createdAt: new Date("2026-10-19T10:00:05Z"),
        htmlSanitized: "<p>oi</p>",
        sendStatus: null,
        sendError: null,
        providerMessageId: "INBOX:1:1",
        attachments: [
          {
            id: 77,
            filename: "a.pdf",
            size: 10,
            contentType: "application/pdf",
            skippedReason: null,
            storageKey: "email/1/1/secret-key",
            companyId: 1
          }
        ]
      },
      {
        id: 2,
        messageId: "m-out",
        direction: "out",
        fromAddress: { address: "suporte@empresa.com.br" },
        toAddresses: [{ address: "cliente@x.com" }],
        ccAddresses: [{ address: "outro@x.com" }],
        receivedAt: null,
        createdAt: new Date("2026-10-19T11:00:00Z"),
        htmlSanitized: null,
        sendStatus: "failed",
        sendError: {
          code: "ERR_EMAIL_REJECTED",
          at: "2026-10-19T11:00:01Z",
          detail: "550 bob@x.com token=abc"
        },
        providerMessageId: null,
        attachments: []
      }
    ];

    const setup = (options: FakeAccount = {}) => {
      accounts = [makeAccount()];
      const ticketFound =
        options.ticket === undefined ? ticket() : options.ticket;
      const findTicket = jest
        .spyOn(Ticket, "findOne")
        .mockImplementation((async (query: any) =>
          ticketFound &&
          ticketFound.companyId === query.where.companyId &&
          ticketFound.id === Number(query.where.id)
            ? ticketFound
            : null) as any);
      const ticketUpdate = jest
        .spyOn(Ticket, "update")
        .mockResolvedValue([1] as any);
      const findEmailMessages = jest
        .spyOn(EmailMessage, "findAll")
        .mockResolvedValue((options.emailMessages || emailMessages()) as any);
      const findMessages = jest
        .spyOn(Message, "findAll")
        .mockImplementation((async (query: any) => {
          const all = [
            { id: "m-in", body: "Olá, preciso de um orçamento", queueId: 3 },
            { id: "m-out", body: "Segue", queueId: 4 }
          ];
          const restriction = query.where.queueId;
          if (!restriction) return all;
          // same shape as ListMessagesService: queueId IN (user queues) OR NULL
          const allowed: number[] = restriction[Op.or][Op.in];
          return all.filter(
            item => allowed.includes(item.queueId) || item.queueId === null
          );
        }) as any);
      const messageUpdate = jest
        .spyOn(Message, "update")
        .mockResolvedValue([1] as any);
      return {
        findTicket,
        ticketUpdate,
        findEmailMessages,
        findMessages,
        messageUpdate
      };
    };

    it("returns the account, subject and normalized messages", async () => {
      setup();
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(200);
      expect(response.body.subject).toBe("Orçamento");
      expect(response.body.account).toMatchObject({
        id: 1,
        name: "Suporte",
        address: "suporte@empresa.com.br",
        status: "active"
      });
      const [incoming, outgoing] = response.body.messages;
      expect(incoming).toEqual({
        id: 1,
        messageId: "m-in",
        direction: "in",
        from: { name: "Cliente", address: "cliente@x.com" },
        to: [{ address: "suporte@empresa.com.br" }],
        cc: [],
        replyTo: [],
        oversize: false,
        date: "2026-10-19T10:00:00.000Z",
        text: "Olá, preciso de um orçamento",
        htmlSanitized: "<p>oi</p>",
        sendStatus: null,
        sendError: null,
        attachments: [
          {
            id: 77,
            filename: "a.pdf",
            size: 10,
            contentType: "application/pdf",
            skippedReason: null
          }
        ]
      });
      expect(outgoing.date).toBe("2026-10-19T11:00:00.000Z");
      expect(outgoing.cc).toEqual([{ address: "outro@x.com" }]);
      expect(outgoing.sendStatus).toBe("failed");
      // only the fixed code goes out: no timestamp, no provider detail
      expect(outgoing.sendError).toEqual({ code: "ERR_EMAIL_REJECTED" });
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain("bob@x.com");
      expect(serialized).not.toContain("storageKey");
      expect(serialized).not.toContain("secret-key");
      secretKeys.forEach(key => expect(serialized).not.toContain(key));
    });

    it("exposes replyTo when the row has it and [] when it is null", async () => {
      const messages = emailMessages();
      (messages[0] as any).replyToAddresses = [
        { name: "Vendas", address: "vendas@x.com" }
      ];
      (messages[1] as any).replyToAddresses = null;
      setup({ emailMessages: messages });
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(200);
      expect(response.body.messages[0].replyTo).toEqual([
        { name: "Vendas", address: "vendas@x.com" }
      ]);
      expect(response.body.messages[1].replyTo).toEqual([]);
    });

    it("exposes only the oversize boolean, never the rest of the flags", async () => {
      const messages = emailMessages();
      (messages[0] as any).flags = ["\\Seen", "oversize"];
      (messages[1] as any).flags = ["\\Seen"];
      setup({ emailMessages: messages });
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.body.messages[0].oversize).toBe(true);
      expect(response.body.messages[1].oversize).toBe(false);
      expect(response.body.messages[0]).not.toHaveProperty("flags");
      expect(response.body.messages[0]).not.toHaveProperty("dataJson");
      expect(JSON.stringify(response.body)).not.toContain("Seen");
    });

    it("flags truncated=false for a short thread", async () => {
      setup();
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.body.truncated).toBe(false);
    });

    it("caps the thread at 300 messages and reports truncated=true", async () => {
      const [template] = emailMessages();
      const many = Array.from({ length: 301 }, (_, index) => ({
        ...template,
        id: 1000 - index,
        messageId: `m-${index}`
      }));
      const { findEmailMessages } = setup({ emailMessages: many });
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(200);
      expect(response.body.truncated).toBe(true);
      expect(response.body.messages).toHaveLength(300);
      expect(findEmailMessages).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 301 })
      );
    });

    it("replaces a malformed stored error code by a fixed one", async () => {
      const messages = emailMessages();
      messages[1].sendError = { code: "550 raw provider text" } as any;
      setup({ emailMessages: messages });
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.body.messages[1].sendError).toEqual({
        code: "ERR_EMAIL_SEND_FAILED"
      });
    });

    it("keeps the Gmail API refusal codes (ERR_GMAIL_SEND_<status>)", async () => {
      const messages = emailMessages();
      messages[1].sendError = { code: "ERR_GMAIL_SEND_403" } as any;
      setup({ emailMessages: messages });
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.body.messages[1].sendError).toEqual({
        code: "ERR_GMAIL_SEND_403"
      });
    });

    it.each(["ERR_GMAIL_SEND_40", "ERR_GMAIL_SEND_4031", "ERR_GMAIL_OTHER"])(
      "still replaces the look-alike code %s",
      async code => {
        const messages = emailMessages();
        messages[1].sendError = { code } as any;
        setup({ emailMessages: messages });
        const response = await request(app)
          .get("/email/tickets/10/thread")
          .set("x-test-user", asUser(1));
        expect(response.body.messages[1].sendError).toEqual({
          code: "ERR_EMAIL_SEND_FAILED"
        });
      }
    );

    it("scopes every query to the company and the ticket", async () => {
      const { findEmailMessages, findMessages } = setup();
      await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(findEmailMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ticketId: 10, companyId: 1 })
        })
      );
      expect(findMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ticketId: 10, companyId: 1 })
        })
      );
    });

    it("resets unread messages and emits the usual ticket update", async () => {
      const { ticketUpdate, messageUpdate } = setup();
      await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(ticketUpdate).toHaveBeenCalledWith(
        { unreadMessages: 0 },
        expect.objectContaining({
          where: { id: 10, companyId: 1 },
          silent: true
        })
      );
      expect(messageUpdate).toHaveBeenCalledWith(
        { read: true },
        { where: { ticketId: 10, companyId: 1, read: false } }
      );
      expect(roomTo).toHaveBeenCalledWith("10");
      expect(roomTo).toHaveBeenCalledWith("company-1-open");
      expect(roomTo).toHaveBeenCalledWith("queue-3-open");
      expect(emit).toHaveBeenCalledWith("company-1-ticket", {
        action: "updateUnread",
        ticketId: 10
      });
    });

    it("does not touch or emit anything when nothing was unread", async () => {
      const { ticketUpdate, messageUpdate } = setup({
        ticket: ticket({ unreadMessages: 0 })
      });
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(200);
      expect(ticketUpdate).not.toHaveBeenCalled();
      expect(messageUpdate).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it("still answers the thread when the socket emit fails", async () => {
      setup();
      (getIO as jest.Mock).mockImplementation(() => {
        throw new Error("socket down");
      });
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(200);
    });

    it("company B gets 404 for a company A ticket thread", async () => {
      const { ticketUpdate } = setup();
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(2));
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "ERR_NO_TICKET_FOUND" });
      expect(ticketUpdate).not.toHaveBeenCalled();
    });

    it("answers 404 for a WhatsApp ticket", async () => {
      setup({ ticket: ticket({ channel: "whatsapp" }) });
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(404);
    });

    it("applies the queue visibility of GET /messages/:ticketId to non-admin users", async () => {
      setup();
      (GetCompanySetting as jest.Mock).mockImplementation(
        async (_companyId, key, fallback) =>
          key === "messageVisibility" ? "message" : fallback
      );
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1, "user", 8));
      expect(response.status).toBe(200);
      // user 8 only belongs to queue 3: the message routed to queue 4 is hidden
      expect(response.body.messages.map((m: any) => m.messageId)).toEqual([
        "m-in"
      ]);
    });

    it("shows every message to an admin", async () => {
      setup();
      (GetCompanySetting as jest.Mock).mockImplementation(
        async (_companyId, key, fallback) =>
          key === "messageVisibility" ? "message" : fallback
      );
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1, "admin", 100));
      expect(response.body.messages).toHaveLength(2);
    });

    it("returns account null when the ticket lost its account", async () => {
      setup({ ticket: ticket({ emailAccountId: null }) });
      const response = await request(app)
        .get("/email/tickets/10/thread")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(200);
      expect(response.body.account).toBeNull();
    });
  });

  describe("attachments", () => {
    const stream = (content: string) => Readable.from([Buffer.from(content)]);

    it("streams with safe headers and a safe content type", async () => {
      (openAttachment as jest.Mock).mockResolvedValue({
        attachment: {
          id: 5,
          filename: "relatório-日本.pdf",
          contentType: "application/pdf; charset=binary"
        },
        stream: stream("%PDF-1.4")
      });
      const response = await request(app)
        .get("/email/attachments/5")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(200);
      expect(openAttachment).toHaveBeenCalledWith(1, 5);
      expect(response.headers["content-type"]).toBe("application/pdf");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-disposition"]).toMatch(/^attachment;/);
      expect(response.headers["content-disposition"]).toContain(
        "filename*=UTF-8''relat%C3%B3rio-%E6%97%A5%E6%9C%AC.pdf"
      );
      expect(response.headers["cache-control"]).toMatch(/private/);
      expect(Buffer.from(response.body).toString()).toBe("%PDF-1.4");
    });

    it.each([
      ["text/html", "application/octet-stream"],
      ["image/svg+xml", "application/octet-stream"],
      [null, "application/octet-stream"],
      ["image/png", "image/png"]
    ])("serves %s as %s", async (stored, served) => {
      (openAttachment as jest.Mock).mockResolvedValue({
        attachment: { id: 5, filename: "x.html", contentType: stored },
        stream: stream("<script>alert(1)</script>")
      });
      const response = await request(app)
        .get("/email/attachments/5")
        .set("x-test-user", asUser(1));
      expect(response.headers["content-type"]).toBe(served);
      expect(response.headers["content-disposition"]).toMatch(/^attachment;/);
    });

    it("never concatenates a hostile filename into Content-Disposition", async () => {
      (openAttachment as jest.Mock).mockResolvedValue({
        attachment: {
          id: 5,
          filename: 'a";b.txt\r\nX-Evil: 1',
          contentType: "text/plain"
        },
        stream: stream("x")
      });
      const response = await request(app)
        .get("/email/attachments/5")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(200);
      expect(response.headers["x-evil"]).toBeUndefined();
      const disposition = response.headers["content-disposition"];
      expect(disposition).toMatch(/^attachment;/);
      expect(disposition).toContain("filename*=UTF-8''");
      expect(disposition).not.toContain('a";b');
      expect(disposition).not.toMatch(/[\r\n]/);
    });

    describe("queue visibility", () => {
      const mockOpen = () =>
        (openAttachment as jest.Mock).mockResolvedValue({
          attachment: { id: 5, filename: "a.txt", contentType: "text/plain" },
          stream: stream("x")
        });
      const chain = (queueId: number | null) => {
        jest
          .spyOn(EmailAttachment, "findOne")
          .mockResolvedValue({ id: 5, emailMessageId: 2 } as any);
        jest
          .spyOn(EmailMessage, "findOne")
          .mockResolvedValue({ id: 2, messageId: "m-1", ticketId: 10 } as any);
        // honours the queue restriction the way the database would
        return jest.spyOn(Message, "findOne").mockImplementation((async (
          query: any
        ) => {
          const restriction = query.where.queueId?.[Op.or];
          const allowed =
            !restriction ||
            restriction[Op.in].includes(queueId) ||
            queueId === null;
          return allowed ? { id: "m-1" } : null;
        }) as any);
      };
      const visibility = (value: string) =>
        (GetCompanySetting as jest.Mock).mockImplementation(
          async (_companyId, key, fallback) =>
            key === "messageVisibility" ? value : fallback
        );
      const download = (profile: string, id: number) =>
        request(app)
          .get("/email/attachments/5")
          .set("x-test-user", asUser(1, profile, id));

      it("answers 404 to a user whose queues do not include the message's queue", async () => {
        mockOpen();
        visibility("message");
        const findMessage = chain(4);
        const response = await download("user", 8);
        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          error: "ERR_EMAIL_ATTACHMENT_NOT_FOUND"
        });
        expect(findMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ companyId: 1, ticketId: 10 })
          })
        );
        expect(openAttachment).not.toHaveBeenCalled();
      });

      it("serves a user whose queue matches", async () => {
        mockOpen();
        visibility("message");
        chain(3);
        const response = await download("user", 8);
        expect(response.status).toBe(200);
        expect(openAttachment).toHaveBeenCalledWith(1, 5);
      });

      it("serves a message that has no queue", async () => {
        mockOpen();
        visibility("message");
        chain(null);
        const response = await download("user", 8);
        expect(response.status).toBe(200);
      });

      it("serves everything to an admin without extra lookups", async () => {
        mockOpen();
        visibility("message");
        const findMessage = chain(4);
        const response = await download("admin", 100);
        expect(response.status).toBe(200);
        expect(findMessage).not.toHaveBeenCalled();
      });

      it("serves everything when the company does not restrict by message queue", async () => {
        mockOpen();
        visibility("ticket");
        const findMessage = chain(4);
        const response = await download("user", 8);
        expect(response.status).toBe(200);
        expect(findMessage).not.toHaveBeenCalled();
      });

      it("answers 404 when the attachment row is gone", async () => {
        mockOpen();
        visibility("message");
        chain(3);
        (EmailAttachment.findOne as jest.Mock).mockResolvedValue(null);
        const response = await download("user", 8);
        expect(response.status).toBe(404);
        expect(openAttachment).not.toHaveBeenCalled();
      });
    });

    it("company B gets 404 for a company A attachment", async () => {
      (openAttachment as jest.Mock).mockImplementation(
        async (companyId: number) => {
          if (companyId !== 1) {
            throw new AppError("ERR_EMAIL_ATTACHMENT_NOT_FOUND", 404);
          }
          return {
            attachment: { id: 5, filename: "a", contentType: "text/plain" },
            stream: stream("x")
          };
        }
      );
      const response = await request(app)
        .get("/email/attachments/5")
        .set("x-test-user", asUser(2));
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: "ERR_EMAIL_ATTACHMENT_NOT_FOUND"
      });
      expect(openAttachment).toHaveBeenCalledWith(2, 5);
    });

    it("answers 404 for a malformed attachment id without touching storage", async () => {
      const response = await request(app)
        .get("/email/attachments/abc")
        .set("x-test-user", asUser(1));
      expect(response.status).toBe(404);
      expect(openAttachment).not.toHaveBeenCalled();
    });
  });
});

describe("GET /tickets channel filter (ListTicketsService)", () => {
  const list = async (
    channel?: string,
    extra: Record<string, unknown> = {}
  ) => {
    (ShowUserService as jest.Mock).mockResolvedValue({
      id: 3,
      profile: "admin"
    });
    const findAll = jest.spyOn(Ticket, "findAll").mockResolvedValue([]);
    await ListTicketsService({
      userId: "3",
      companyId: 10,
      status: "open",
      queueIds: [],
      tags: [],
      users: [],
      channel,
      ...extra
    });
    const { calls } = findAll.mock;
    return calls[calls.length - 1][0] as {
      where: Record<string | symbol, unknown>;
      include: { as?: string; attributes?: string[]; required?: boolean }[];
    };
  };

  // JSON.stringify drops Sequelize operator symbols; inspect keeps them.
  const shown = (value: unknown) => inspect(value, { depth: 12 });

  it("returns only email tickets with channel=email", async () => {
    const { where } = await list("email");
    expect(shown(where)).toContain("channel: 'email'");
    expect(where).toMatchObject({ companyId: 10 });
  });

  it("lists every non-email ticket (null, voice, ...) under whatsapp", async () => {
    const { where } = await list("whatsapp");
    const text = shown(where);
    expect(text).toContain("channel: { [Symbol(ne)]: 'email' }");
    expect(text).toContain("channel: null");
    expect(text).not.toContain("channel: 'whatsapp'");
  });

  it("keeps equality for any other channel value", async () => {
    const { where } = await list("voice");
    const text = shown(where);
    expect(text).toContain("channel: 'voice'");
    expect(text).not.toContain("Symbol(ne)");
  });

  it("filters by whatsappId and by emailAccountId, scoped to the company", async () => {
    const byWhatsapp = await list(undefined, { whatsappId: 4 });
    expect(shown(byWhatsapp.where)).toContain("whatsappId: 4");
    expect(byWhatsapp.where).toMatchObject({ companyId: 10 });

    const byAccount = await list(undefined, { emailAccountId: 9 });
    expect(shown(byAccount.where)).toContain("emailAccountId: 9");
    expect(byAccount.where).toMatchObject({ companyId: 10 });
  });

  it("combines the connection filter with the channel", async () => {
    const { where } = await list("email", { emailAccountId: 9 });
    const text = shown(where);
    expect(text).toContain("channel: 'email'");
    expect(text).toContain("emailAccountId: 9");
  });

  it.each([[0], [-1], [1.5], [Number.NaN], ["4"]])(
    "ignores the invalid connection id %p",
    async value => {
      const { where } = await list(undefined, {
        whatsappId: value,
        emailAccountId: value
      });
      const text = shown(where);
      expect(text).not.toContain("whatsappId");
      expect(text).not.toContain("emailAccountId");
    }
  );

  it("does not filter by channel when the parameter is absent", async () => {
    const { where } = await list();
    expect(shown(where)).not.toContain("channel");
  });

  it.each([["WhatsApp"], ["a b"], ["email;drop"]])(
    "rejects the invalid channel %j",
    async value => {
      await expect(list(value)).rejects.toMatchObject({
        statusCode: 400,
        message: "ERR_INVALID_CHANNEL"
      });
    }
  );

  it("includes the email account (id, name, address, preset) without requiring it", async () => {
    const { include } = await list();
    const account = include.find(item => item.as === "emailAccount");
    expect(account).toBeDefined();
    expect(account?.required).toBe(false);
    expect(account?.attributes).toEqual(["id", "name", "address", "preset"]);
  });
});

describe("GET /tickets?channel=email through TicketController", () => {
  const ticketApp = express();
  ticketApp.use(express.json());
  ticketApp.get("/tickets", isAuth, TicketController.index);
  ticketApp.use(
    (
      err: AppError,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => res.status(err.statusCode || 500).json({ error: err.message })
  );

  const run = async (query: string) => {
    (ShowUserService as jest.Mock).mockResolvedValue({
      id: 3,
      profile: "admin"
    });
    const findAll = jest
      .spyOn(Ticket, "findAll")
      .mockResolvedValue([{ id: 1, channel: "email" }] as any);
    const response = await request(ticketApp)
      .get(`/tickets${query}`)
      .set("x-test-user", asUser(10, "admin", 3));
    return { response, findAll };
  };

  it("passes the channel to the listing and returns only email tickets", async () => {
    const { response, findAll } = await run("?status=open&channel=email");
    expect(response.status).toBe(200);
    expect(response.body.tickets).toEqual([{ id: 1, channel: "email" }]);
    const { where } = findAll.mock.calls[0][0] as { where: unknown };
    expect(inspect(where, { depth: 12 })).toContain("channel: 'email'");
  });

  it("does not filter without the parameter", async () => {
    const { findAll } = await run("?status=open");
    const { where } = findAll.mock.calls[0][0] as { where: unknown };
    expect(inspect(where, { depth: 12 })).not.toContain("channel");
  });

  it("passes whatsappId and emailAccountId filters, ignoring invalid ones", async () => {
    const { findAll } = await run(
      "?status=open&channel=email&emailAccountId=9&whatsappId=abc"
    );
    const text = inspect(
      (findAll.mock.calls[0][0] as { where: unknown }).where,
      { depth: 12 }
    );
    expect(text).toContain("emailAccountId: 9");
    expect(text).toContain("channel: 'email'");
    expect(text).not.toContain("whatsappId");

    const second = await run("?status=open&whatsappId=4&emailAccountId=-2");
    const { calls } = second.findAll.mock;
    const text2 = inspect(
      (calls[calls.length - 1][0] as { where: unknown }).where,
      { depth: 12 }
    );
    expect(text2).toContain("whatsappId: 4");
    expect(text2).not.toContain("emailAccountId");
  });

  it("ignores repeated connection filters instead of failing", async () => {
    const { response, findAll } = await run(
      "?status=open&whatsappId=4&whatsappId=5"
    );
    expect(response.status).toBe(200);
    const text = inspect(
      (findAll.mock.calls[0][0] as { where: unknown }).where,
      { depth: 12 }
    );
    expect(text).not.toContain("whatsappId");
  });

  it("rejects a repeated channel parameter", async () => {
    const { response, findAll } = await run("?channel=email&channel=whatsapp");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "ERR_INVALID_CHANNEL" });
    expect(findAll).not.toHaveBeenCalled();
  });
});

describe("ShowTicketService email account include", () => {
  it("includes the email account (id, name, address, preset), not required", async () => {
    const findOne = jest
      .spyOn(Ticket, "findOne")
      .mockResolvedValue({ id: 1, companyId: 10 } as any);
    await ShowTicketService(1, 10);
    const { include } = findOne.mock.calls[0][0] as {
      include: { as?: string; attributes?: string[]; required?: boolean }[];
    };
    const account = include.find(item => item.as === "emailAccount");
    expect(account).toBeDefined();
    expect(account?.required).toBe(false);
    expect(account?.attributes).toEqual(["id", "name", "address", "preset"]);
  });
});
