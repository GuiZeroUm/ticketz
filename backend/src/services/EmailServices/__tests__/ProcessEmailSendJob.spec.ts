/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import os from "os";
import path from "path";
import EmailAccount from "../../../models/EmailAccount";
import EmailAttachment from "../../../models/EmailAttachment";
import EmailMessage from "../../../models/EmailMessage";
import Message from "../../../models/Message";
import { getIO } from "../../../libs/socket";
import { logger } from "../../../utils/logger";
import { emailEnabledForCompany } from "../EmailAccessService";
import { markAccountError } from "../EmailAccountStatusService";
import emailRedis from "../emailRedis";
import { getAdapter } from "../adapters";
import {
  EmailAuthError,
  EmailSendAmbiguousError,
  EmailSendRejectedError,
  EmailTransientError
} from "../adapters/errors";

const mockPrivateDir = fs.mkdtempSync(path.join(os.tmpdir(), "email-send-"));

jest.mock("../../../config/privateFiles", () => ({
  __esModule: true,
  default: { directory: mockPrivateDir }
}));
jest.mock("../../../database", () => ({
  __esModule: true,
  default: { transaction: jest.fn(async (fn: any) => fn({ id: "tx" })) }
}));
jest.mock("../../../models/EmailMessage", () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), update: jest.fn() }
}));
jest.mock("../../../models/EmailAccount", () => {
  const scoped = { findOne: jest.fn() };
  return {
    __esModule: true,
    default: { scope: jest.fn(() => scoped), findByPk: jest.fn(), scoped }
  };
});
jest.mock("../../../models/EmailAttachment", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));
jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), update: jest.fn() }
}));
jest.mock("../EmailAccessService", () => ({
  emailEnabledForCompany: jest.fn()
}));
jest.mock("../EmailAccountStatusService", () => ({
  markAccountError: jest.fn()
}));
jest.mock("../emailRedis", () => {
  const client = { set: jest.fn(), del: jest.fn() };
  return { __esModule: true, default: () => client };
});
jest.mock("../adapters", () => {
  const actual = jest.requireActual("../adapters/errors");
  const adapter = { send: jest.fn() };
  return { ...actual, getAdapter: jest.fn(() => adapter) };
});
jest.mock("../../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import ProcessEmailSendJob, {
  SEND_RETRY_DELAYS_MS,
  sendInflightKey
} from "../ProcessEmailSendJob";

const EM = EmailMessage as any;
const Account = EmailAccount as any;
const Attachment = EmailAttachment as any;
const Msg = Message as any;
const redis = (emailRedis as any)();
const adapter = (getAdapter as jest.Mock)();
const emit = jest.fn();

const queuedEmail = (over: any = {}) => ({
  id: 41,
  companyId: 7,
  emailAccountId: 3,
  ticketId: 90,
  messageId: "msg-uuid",
  direction: "out",
  sendStatus: "queued",
  internetMessageId: "<abc@acme.com>",
  inReplyTo: "<parent@client.com>",
  references: ["<root@client.com>", "<parent@client.com>"],
  subject: "Re: Pedido",
  fromAddress: { name: "Acme", address: "contato@acme.com" },
  toAddresses: [{ address: "cliente@client.com", name: "Cliente" }],
  ccAddresses: [{ address: "outro@client.com" }],
  htmlSanitized: "<p>Olá</p>",
  ...over
});

const account = (over: any = {}) => ({
  id: 3,
  companyId: 7,
  provider: "imap_smtp",
  status: "active",
  address: "contato@acme.com",
  name: "Acme",
  ...over
});

const chatMessage = { id: "msg-uuid", ticketId: 90, companyId: 7, body: "Olá" };

let attachmentFile: string;

beforeAll(() => {
  const dir = path.join(mockPrivateDir, "email", "7", "41");
  fs.mkdirSync(dir, { recursive: true });
  attachmentFile = path.join(dir, "1b4e28ba-2fa1-11d2-883f-0016d3cca427");
  fs.writeFileSync(attachmentFile, "pdf");
});

afterAll(() => {
  fs.rmSync(mockPrivateDir, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  EM.findByPk.mockResolvedValue(queuedEmail());
  EM.update.mockResolvedValue([1]);
  Account.scoped.findOne.mockResolvedValue(account());
  Account.findByPk.mockResolvedValue(account());
  Attachment.findAll.mockResolvedValue([]);
  Msg.findOne.mockResolvedValue(chatMessage);
  Msg.update.mockResolvedValue([1]);
  (emailEnabledForCompany as jest.Mock).mockResolvedValue(true);
  redis.set.mockResolvedValue("OK");
  redis.del.mockResolvedValue(1);
  adapter.send.mockResolvedValue({});
  (getIO as jest.Mock).mockReturnValue({ to: () => ({ emit }) });
});

const emailUpdate = () => EM.update.mock.calls[0];
const messageUpdate = () => Msg.update.mock.calls[0];

describe("ProcessEmailSendJob", () => {
  it("sends the stored email and marks it sent with ack 1", async () => {
    Attachment.findAll.mockResolvedValue([
      {
        filename: "pedido.pdf",
        contentType: "application/pdf",
        storageKey: "email/7/41/1b4e28ba-2fa1-11d2-883f-0016d3cca427",
        skippedReason: null
      }
    ]);
    adapter.send.mockResolvedValue({ providerMessageId: "gm-1" });

    await ProcessEmailSendJob(41);

    expect(Account.scope).toHaveBeenCalledWith("withSecrets");
    expect(Account.scoped.findOne).toHaveBeenCalledWith({
      where: { id: 3, companyId: 7 }
    });
    const [sentAccount, mail] = adapter.send.mock.calls[0];
    expect(sentAccount.id).toBe(3);
    expect(mail).toEqual({
      from: { name: "Acme", address: "contato@acme.com" },
      to: [{ address: "cliente@client.com", name: "Cliente" }],
      cc: [{ address: "outro@client.com" }],
      subject: "Re: Pedido",
      text: "Olá",
      html: "<p>Olá</p>",
      messageId: "<abc@acme.com>",
      inReplyTo: "<parent@client.com>",
      references: ["<root@client.com>", "<parent@client.com>"],
      attachments: [
        {
          filename: "pedido.pdf",
          contentType: "application/pdf",
          path: attachmentFile
        }
      ]
    });

    const [changes, options] = emailUpdate();
    expect(changes).toEqual({
      sendStatus: "sent",
      sendError: null,
      providerMessageId: "gm-1"
    });
    expect(options.where.id).toBe(41);
    expect(messageUpdate()[0]).toEqual({ ack: 1, error: null });
    expect(emit).toHaveBeenCalledWith("company-7-appMessage", {
      action: "update",
      message: chatMessage
    });
    // the marker of a finished send is kept: a stalled re-run must not resend
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("claims the send with a Redis marker before talking to the server", async () => {
    await ProcessEmailSendJob(41);
    expect(redis.set).toHaveBeenCalledWith(
      sendInflightKey(41),
      expect.any(String),
      "EX",
      expect.any(Number),
      "NX"
    );
    expect(redis.set.mock.invocationCallOrder[0]).toBeLessThan(
      adapter.send.mock.invocationCallOrder[0]
    );
  });

  it("marks a partial rejection as sent with ERR_EMAIL_PARTIAL_REJECTION", async () => {
    adapter.send.mockResolvedValue({ rejectedCount: 2 });
    await ProcessEmailSendJob(41);
    expect(emailUpdate()[0]).toEqual({
      sendStatus: "sent",
      sendError: { code: "ERR_EMAIL_PARTIAL_REJECTION" }
    });
    expect(messageUpdate()[0]).toEqual({ ack: 1, error: null });
  });

  it("marks ambiguous send as unknown and never retries", async () => {
    adapter.send.mockRejectedValue(new EmailSendAmbiguousError());
    const scheduleRetry = jest.fn();
    await ProcessEmailSendJob(41, { attempt: 0, scheduleRetry });
    expect(scheduleRetry).not.toHaveBeenCalled();
    expect(emailUpdate()[0]).toEqual({
      sendStatus: "unknown",
      sendError: { code: "ERR_EMAIL_SEND_AMBIGUOUS" }
    });
    // ack untouched (no failure shown), marker kept so nothing re-sends it
    expect(Msg.update).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalled();
  });

  it("treats an unexpected adapter error as ambiguous, never as retryable", async () => {
    adapter.send.mockRejectedValue(new TypeError("boom 535 secret@x.com"));
    const scheduleRetry = jest.fn();
    await ProcessEmailSendJob(41, { scheduleRetry });
    expect(scheduleRetry).not.toHaveBeenCalled();
    expect(emailUpdate()[0].sendStatus).toBe("unknown");
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toMatch(
      /secret@x\.com|boom/
    );
  });

  it("retries transient failures up to 3 times then fails", async () => {
    adapter.send.mockRejectedValue(new EmailTransientError(undefined, "ECONN"));
    const scheduleRetry = jest.fn().mockResolvedValue(undefined);

    // eslint-disable-next-line no-restricted-syntax
    for (const attempt of [0, 1, 2]) {
      await ProcessEmailSendJob(41, { attempt, scheduleRetry });
    }
    expect(scheduleRetry.mock.calls).toEqual([
      [1, 30 * 1000],
      [2, 2 * 60 * 1000],
      [3, 10 * 60 * 1000]
    ]);
    expect(SEND_RETRY_DELAYS_MS).toEqual([30000, 120000, 600000]);
    // still queued while retries are pending, marker released for the retry
    expect(EM.update).not.toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledTimes(3);

    await ProcessEmailSendJob(41, { attempt: 3, scheduleRetry });
    expect(scheduleRetry).toHaveBeenCalledTimes(3);
    expect(emailUpdate()[0]).toEqual({
      sendStatus: "failed",
      sendError: { code: "ERR_EMAIL_TRANSIENT" }
    });
    expect(messageUpdate()[0]).toEqual({
      ack: -1,
      error: { code: "ERR_EMAIL_TRANSIENT" }
    });
  });

  it("fails with ERR_EMAIL_TRANSIENT when the retry cannot be scheduled", async () => {
    adapter.send.mockRejectedValue(new EmailTransientError());
    const scheduleRetry = jest.fn().mockRejectedValue(new Error("redis"));
    await ProcessEmailSendJob(41, { attempt: 0, scheduleRetry });
    expect(emailUpdate()[0]).toEqual({
      sendStatus: "failed",
      sendError: { code: "ERR_EMAIL_TRANSIENT" }
    });
  });

  it("marks a rejected send failed with its fixed code and ack -1", async () => {
    adapter.send.mockRejectedValue(
      new EmailSendRejectedError("ERR_EMAIL_REJECTED", "550")
    );
    await ProcessEmailSendJob(41);
    expect(emailUpdate()[0]).toEqual({
      sendStatus: "failed",
      sendError: { code: "ERR_EMAIL_REJECTED" }
    });
    expect(messageUpdate()[0]).toEqual({
      ack: -1,
      error: { code: "ERR_EMAIL_REJECTED" }
    });
    expect(redis.del).toHaveBeenCalledWith(sendInflightKey(41));
  });

  it("fails and flags the account for re-authentication on EmailAuthError", async () => {
    const fresh = account({ updatedAt: new Date() });
    Account.findByPk.mockResolvedValue(fresh);
    const err = new EmailAuthError();
    adapter.send.mockRejectedValue(err);
    const scheduleRetry = jest.fn();
    await ProcessEmailSendJob(41, { scheduleRetry });
    expect(emailUpdate()[0]).toEqual({
      sendStatus: "failed",
      sendError: { code: "ERR_EMAIL_AUTH_FAILED" }
    });
    expect(markAccountError).toHaveBeenCalledWith(fresh, err);
    expect(scheduleRetry).not.toHaveBeenCalled();
  });

  it("keeps the credentials-missing code on EmailAuthError", async () => {
    adapter.send.mockRejectedValue(
      new EmailAuthError("ERR_EMAIL_CREDENTIALS_MISSING")
    );
    await ProcessEmailSendJob(41);
    expect(emailUpdate()[0].sendError).toEqual({
      code: "ERR_EMAIL_CREDENTIALS_MISSING"
    });
  });

  it("does nothing when job runs for a message no longer queued", async () => {
    // eslint-disable-next-line no-restricted-syntax
    for (const sendStatus of ["sent", "failed", "unknown"]) {
      EM.findByPk.mockResolvedValueOnce(queuedEmail({ sendStatus }));
      await ProcessEmailSendJob(41);
    }
    EM.findByPk.mockResolvedValueOnce(null);
    await ProcessEmailSendJob(41);
    EM.findByPk.mockResolvedValueOnce(queuedEmail({ direction: "in" }));
    await ProcessEmailSendJob(41);

    expect(adapter.send).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(EM.update).not.toHaveBeenCalled();
  });

  it("marks the send unknown when another run already claimed it", async () => {
    redis.set.mockResolvedValue(null);
    await ProcessEmailSendJob(41);
    expect(adapter.send).not.toHaveBeenCalled();
    expect(emailUpdate()[0]).toEqual({
      sendStatus: "unknown",
      sendError: { code: "ERR_EMAIL_SEND_AMBIGUOUS" }
    });
  });

  it("only updates rows still queued (a bounce or Sent copy wins)", async () => {
    EM.update.mockResolvedValue([0]);
    await ProcessEmailSendJob(41);
    expect(emailUpdate()[1].where).toMatchObject({ id: 41, companyId: 7 });
    expect(JSON.stringify(Object.keys(emailUpdate()[1].where))).toContain(
      "sendStatus"
    );
    expect(Msg.update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("fails with ERR_EMAIL_ACCOUNT_UNAVAILABLE when the account cannot send", async () => {
    // eslint-disable-next-line no-restricted-syntax
    for (const found of [
      null,
      account({ status: "reauth_required" }),
      account({ status: "disabled" })
    ]) {
      Account.scoped.findOne.mockResolvedValueOnce(found);
      await ProcessEmailSendJob(41);
    }
    expect(adapter.send).not.toHaveBeenCalled();
    expect(EM.update.mock.calls.map((c: any[]) => c[0].sendError)).toEqual([
      { code: "ERR_EMAIL_ACCOUNT_UNAVAILABLE" },
      { code: "ERR_EMAIL_ACCOUNT_UNAVAILABLE" },
      { code: "ERR_EMAIL_ACCOUNT_UNAVAILABLE" }
    ]);
  });

  it("fails instead of sending when the chat message is gone", async () => {
    Msg.findOne.mockResolvedValue(null);
    await ProcessEmailSendJob(41);
    expect(adapter.send).not.toHaveBeenCalled();
    expect(emailUpdate()[0].sendError).toEqual({
      code: "ERR_EMAIL_INVALID_MESSAGE"
    });
  });

  it("fails with ERR_EMAIL_CHANNEL_DISABLED when the company turned email off", async () => {
    (emailEnabledForCompany as jest.Mock).mockResolvedValue(false);
    await ProcessEmailSendJob(41);
    expect(adapter.send).not.toHaveBeenCalled();
    expect(emailUpdate()[0].sendError).toEqual({
      code: "ERR_EMAIL_CHANNEL_DISABLED"
    });
  });

  it("fails with attachment_missing semantics when a stored file is gone", async () => {
    Attachment.findAll.mockResolvedValue([
      {
        filename: "x.pdf",
        contentType: "application/pdf",
        storageKey: "email/8/41/1b4e28ba-2fa1-11d2-883f-0016d3cca427",
        skippedReason: null
      }
    ]);
    await ProcessEmailSendJob(41);
    expect(adapter.send).not.toHaveBeenCalled();
    expect(emailUpdate()[0].sendError).toEqual({
      code: "ERR_EMAIL_INVALID_MESSAGE"
    });
  });
});
