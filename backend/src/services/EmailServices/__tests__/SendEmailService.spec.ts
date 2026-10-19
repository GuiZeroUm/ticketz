/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import os from "os";
import path from "path";
import { UniqueConstraintError } from "sequelize";
import AppError from "../../../errors/AppError";
import EmailAccount from "../../../models/EmailAccount";
import EmailAttachment from "../../../models/EmailAttachment";
import EmailMessage from "../../../models/EmailMessage";
import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import { enqueueEmailSend } from "../../../queues/email";
import { checkCompanyCompliant } from "../../../helpers/CheckCompanyCompliant";
import { getIO } from "../../../libs/socket";
import { websocketCreateMessage } from "../../MessageServices/CreateMessageService";
import { websocketUpdateTicket } from "../../TicketServices/UpdateTicketService";
import { assertEmailEnabled } from "../EmailAccessService";
import emailRedis from "../emailRedis";
import { MAX_OUTBOUND_ATTACHMENTS_BYTES, MAX_RECIPIENTS } from "../limits";

const mockPrivateDir = fs.mkdtempSync(path.join(os.tmpdir(), "email-out-"));
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "email-upload-"));

jest.mock("../../../config/privateFiles", () => ({
  __esModule: true,
  default: { directory: mockPrivateDir }
}));
jest.mock("../../../database", () => ({
  __esModule: true,
  default: { transaction: jest.fn(async (fn: any) => fn({ id: "tx" })) }
}));
jest.mock("../../../models/EmailAccount", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/EmailMessage", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() }
}));
jest.mock("../../../models/EmailAttachment", () => ({
  __esModule: true,
  default: { findAll: jest.fn(), create: jest.fn() }
}));
jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() }
}));
jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: { update: jest.fn() }
}));
jest.mock("../../../queues/email", () => ({
  enqueueEmailSend: jest.fn()
}));
jest.mock("../EmailAccessService", () => ({
  assertEmailEnabled: jest.fn()
}));
jest.mock("../../TranslationServices/i18nService", () => ({
  _t: (key: string) => key
}));
jest.mock("../../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../../helpers/CheckCompanyCompliant", () => ({
  checkCompanyCompliant: jest.fn()
}));
jest.mock("../../MessageServices/CreateMessageService", () => ({
  __esModule: true,
  default: jest.fn(),
  websocketCreateMessage: jest.fn()
}));
jest.mock("../../TicketServices/UpdateTicketService", () => ({
  __esModule: true,
  default: jest.fn(),
  websocketUpdateTicket: jest.fn()
}));
jest.mock("../adapters", () => ({ getAdapter: jest.fn() }));
jest.mock("../emailRedis", () => {
  const client = { exists: jest.fn(), set: jest.fn(), del: jest.fn() };
  return { __esModule: true, default: () => client };
});
jest.mock("../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import SendEmailService from "../SendEmailService";

const Account = EmailAccount as any;
const EM = EmailMessage as any;
const Attachment = EmailAttachment as any;
const Msg = Message as any;
const TicketModel = Ticket as any;
const emit = jest.fn();
const redis = (emailRedis as any)();

const ticket = (over: any = {}) =>
  ({
    id: 90,
    companyId: 7,
    channel: "email",
    emailAccountId: 3,
    subject: "Pedido 123",
    queueId: 5,
    contactId: 11,
    status: "open",
    ...over
  }) as any;

const account = (over: any = {}) => ({
  id: 3,
  companyId: 7,
  provider: "imap_smtp",
  status: "active",
  address: "contato@acme.com",
  name: "Acme",
  ...over
});

const lastInbound = (over: any = {}) => ({
  id: 30,
  companyId: 7,
  ticketId: 90,
  messageId: "in-msg",
  direction: "in",
  internetMessageId: "<parent@client.com>",
  references: ["sha256:deadbeef", "<root@client.com>"],
  subject: "Pedido 123",
  fromAddress: { name: "Cliente", address: "Cliente@Client.com" },
  toAddresses: [
    { address: "contato@acme.com" },
    { address: "socio@client.com", name: "Sócio" }
  ],
  ccAddresses: [
    { address: "outro@client.com" },
    { address: "socio@client.com" }
  ],
  htmlSanitized: "<p>Pedido original</p>",
  receivedAt: new Date("2026-10-18T10:00:00Z"),
  ...over
});

let existingByKey: any;
let inbound: any;
let created: any;
let createdMessage: any;

const upload = (name: string, content: string, over: any = {}) => {
  const filePath = path.join(uploadDir, `${Date.now()}-${name}`);
  fs.writeFileSync(filePath, content);
  return {
    originalname: name,
    mimetype: "application/pdf",
    path: filePath,
    size: Buffer.byteLength(content),
    ...over
  } as any;
};

const storeOriginal = (name: string, content: string) => {
  const dir = path.join(mockPrivateDir, "email", "7", "30");
  fs.mkdirSync(dir, { recursive: true });
  const key = `email/7/30/${Math.random().toString(16).slice(2)}aa-bb`;
  fs.writeFileSync(path.join(mockPrivateDir, key), content);
  return {
    id: 300,
    filename: name,
    contentType: "image/png",
    size: Buffer.byteLength(content),
    storageKey: key,
    skippedReason: null,
    inline: false
  };
};

const send = (over: any = {}) =>
  SendEmailService({
    ticket: ticket(),
    userId: 2,
    mode: "reply",
    body: "Olá, *tudo certo*.\nAbraço",
    idempotencyKey: "key-1",
    ...over
  });

beforeEach(() => {
  jest.clearAllMocks();
  existingByKey = null;
  inbound = lastInbound();
  (assertEmailEnabled as jest.Mock).mockResolvedValue(undefined);
  Account.findOne.mockResolvedValue(account());
  EM.findOne.mockImplementation(async ({ where }: any) => {
    if (where.idempotencyKey) return existingByKey;
    if (where.direction === "in") return inbound;
    return null;
  });
  EM.create.mockImplementation(async (values: any) => {
    created = { id: 41, ...values };
    return created;
  });
  EM.update.mockResolvedValue([1]);
  Attachment.findAll.mockResolvedValue([]);
  Attachment.create.mockImplementation(async (values: any) => values);
  Msg.create.mockImplementation(async (values: any) => {
    createdMessage = values;
    return values;
  });
  Msg.findOne.mockImplementation(async ({ where }: any) => {
    if (where.id === "in-msg") return { id: "in-msg", body: "Texto original" };
    if (createdMessage && where.id === createdMessage.id) {
      return { ...createdMessage, ticket: { id: 90, companyId: 7 } };
    }
    if (where.id === "old-msg") return { id: "old-msg", ticketId: 90 };
    return null;
  });
  Msg.update.mockResolvedValue([1]);
  TicketModel.update.mockResolvedValue([1]);
  (enqueueEmailSend as jest.Mock).mockResolvedValue(undefined);
  (checkCompanyCompliant as jest.Mock).mockResolvedValue(true);
  (getIO as jest.Mock).mockReturnValue({ to: () => ({ emit }) });
  createdMessage = null;
  created = null;
  redis.exists.mockResolvedValue(0);
});

afterAll(() => {
  fs.rmSync(mockPrivateDir, { recursive: true, force: true });
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

describe("SendEmailService", () => {
  it("reply without Reply-To defaults to the From of the last inbound and threads with In-Reply-To/References", async () => {
    const result = await send();

    const values = EM.create.mock.calls[0][0];
    expect(values).toMatchObject({
      companyId: 7,
      emailAccountId: 3,
      ticketId: 90,
      direction: "out",
      sendStatus: "queued",
      userId: 2,
      idempotencyKey: "key-1",
      subject: "Re: Pedido 123",
      inReplyTo: "<parent@client.com>",
      // digests of over-long ids are not real Message-IDs and are dropped
      references: ["<root@client.com>", "<parent@client.com>"],
      fromAddress: { name: "Acme", address: "contato@acme.com" },
      toAddresses: [{ address: "cliente@client.com", name: "Cliente" }],
      ccAddresses: []
    });
    expect(values.internetMessageId).toMatch(/^<[0-9a-f-]{36}@acme\.com>$/);
    expect(values.htmlSanitized).toContain("<strong>tudo certo</strong>");

    expect(Msg.create.mock.calls[0][0]).toMatchObject({
      id: values.messageId,
      ticketId: 90,
      companyId: 7,
      channel: "email",
      fromMe: true,
      read: true,
      ack: 0,
      queueId: 5,
      body: "Olá, *tudo certo*.\nAbraço"
    });
    expect(JSON.parse(Msg.create.mock.calls[0][0].dataJson)).toMatchObject({
      source: "email",
      emailMessageId: 41
    });
    // inbound lookup is scoped to this ticket and company
    const inboundQuery = EM.findOne.mock.calls.find(
      (c: any[]) => c[0].where.direction === "in"
    )[0];
    expect(inboundQuery.where).toMatchObject({ companyId: 7, ticketId: 90 });

    expect(TicketModel.update).toHaveBeenCalledWith(
      { lastMessage: "Olá, *tudo certo*. Abraço" },
      expect.objectContaining({ where: { id: 90, companyId: 7 } })
    );
    expect(enqueueEmailSend).toHaveBeenCalledWith(41);
    expect(websocketCreateMessage).toHaveBeenCalled();
    expect(websocketUpdateTicket).toHaveBeenCalled();
    // enqueued only after the transaction, and before the emit: a failing
    // emit can never leave a committed email without its job
    expect(
      (enqueueEmailSend as jest.Mock).mock.invocationCallOrder[0]
    ).toBeGreaterThan(Msg.create.mock.invocationCallOrder[0]);
    expect(
      (enqueueEmailSend as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan(
      (websocketCreateMessage as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(result.id).toBe(values.messageId);
  });

  it("reply defaults to the first usable Reply-To of the last inbound", async () => {
    inbound = lastInbound({
      replyToAddresses: [
        { address: "not an address" },
        { address: "Vendas@Client.com", name: "Vendas" },
        { address: "outra@client.com" }
      ]
    });
    await send();
    expect(EM.create.mock.calls[0][0].toAddresses).toEqual([
      { address: "vendas@client.com", name: "Vendas" }
    ]);
    expect(EM.create.mock.calls[0][0].ccAddresses).toEqual([]);
  });

  it("replyAll with Reply-To goes to it plus to/cc, minus own address", async () => {
    inbound = lastInbound({
      replyToAddresses: [{ address: "vendas@client.com" }],
      ccAddresses: [
        { address: "vendas@client.com" },
        { address: "outro@client.com" }
      ]
    });
    await send({ mode: "replyAll" });
    const values = EM.create.mock.calls[0][0];
    expect(values.toAddresses).toEqual([{ address: "vendas@client.com" }]);
    expect(values.ccAddresses).toEqual([
      { address: "socio@client.com", name: "Sócio" },
      { address: "outro@client.com" }
    ]);
  });

  it("falls back to From when the Reply-To is only the account itself", async () => {
    inbound = lastInbound({
      replyToAddresses: [{ address: "contato@acme.com" }]
    });
    await send();
    expect(EM.create.mock.calls[0][0].toAddresses).toEqual([
      { address: "cliente@client.com", name: "Cliente" }
    ]);
  });

  it("replyAll includes to/cc minus own address, without duplicates", async () => {
    await send({ mode: "replyAll" });
    const values = EM.create.mock.calls[0][0];
    expect(values.toAddresses).toEqual([
      { address: "cliente@client.com", name: "Cliente" }
    ]);
    expect(values.ccAddresses).toEqual([
      { address: "socio@client.com", name: "Sócio" },
      { address: "outro@client.com" }
    ]);
  });

  it("uses the recipients the user typed, validated server side", async () => {
    await send({
      mode: "replyAll",
      to: "Ana <ana@x.com>, cliente@client.com",
      cc: "ana@x.com; bia@y.com"
    });
    const values = EM.create.mock.calls[0][0];
    expect(values.toAddresses).toEqual([
      { address: "ana@x.com", name: "Ana" },
      { address: "cliente@client.com" }
    ]);
    // cc never repeats a To address
    expect(values.ccAddresses).toEqual([{ address: "bia@y.com" }]);
  });

  it("forward requires to and copies original attachments", async () => {
    await expect(send({ mode: "forward", body: "" })).rejects.toMatchObject({
      message: "ERR_EMAIL_RECIPIENT_REQUIRED",
      statusCode: 400
    });
    expect(EM.create).not.toHaveBeenCalled();

    const original = storeOriginal("foto.png", "PNGDATA");
    Attachment.findAll.mockResolvedValue([
      original,
      { ...original, id: 301, storageKey: null, skippedReason: "too_large" }
    ]);
    const extra = upload("nota.pdf", "PDF!");

    await send({
      mode: "forward",
      to: "parceiro@z.com",
      body: "Segue",
      files: [extra]
    });

    const values = EM.create.mock.calls[0][0];
    expect(values.subject).toBe("Fwd: Pedido 123");
    expect(values.toAddresses).toEqual([{ address: "parceiro@z.com" }]);
    expect(values.inReplyTo).toBeNull();
    expect(values.references).toEqual([]);
    expect(values.htmlSanitized).toContain("<p>Pedido original</p>");

    const body = Msg.create.mock.calls[0][0].body as string;
    expect(body.startsWith("Segue")).toBe(true);
    expect(body).toContain("Forwarded message");
    expect(body).toContain("Cliente <Cliente@Client.com>");
    expect(body).toContain("Texto original");

    // the original attachment and the upload are copied to private storage
    const rows = Attachment.create.mock.calls.map((c: any[]) => c[0]);
    expect(rows.map((r: any) => r.filename)).toEqual(["nota.pdf", "foto.png"]);
    rows.forEach((row: any) => {
      expect(row).toMatchObject({ companyId: 7, emailMessageId: 41 });
      expect(row.storageKey).toMatch(/^email\/7\/41\/[A-Za-z0-9-]+$/);
    });
    expect(
      fs.readFileSync(path.join(mockPrivateDir, rows[1].storageKey), "utf8")
    ).toBe("PNGDATA");
    expect(
      fs.readFileSync(path.join(mockPrivateDir, rows[0].storageKey), "utf8")
    ).toBe("PDF!");
    // the upload left the public folder; the original stays in place
    expect(fs.existsSync(extra.path)).toBe(false);
    expect(fs.existsSync(path.join(mockPrivateDir, original.storageKey))).toBe(
      true
    );
  });

  it("rejects invalid, too many recipients and oversize attachments with the ERR_ codes", async () => {
    await expect(
      send({ to: "cliente@client.com, nope" })
    ).rejects.toMatchObject({
      message: "ERR_EMAIL_INVALID_RECIPIENT",
      statusCode: 400
    });
    await expect(
      send({ to: "ok@x.com", cc: "bad@@x.com" })
    ).rejects.toMatchObject({ message: "ERR_EMAIL_INVALID_RECIPIENT" });

    const many = Array.from(
      { length: MAX_RECIPIENTS + 1 },
      (_, i) => `p${i}@x.com`
    );
    await expect(
      send({ to: many.slice(0, 10).join(","), cc: many.slice(10).join(",") })
    ).rejects.toMatchObject({
      message: "ERR_EMAIL_TOO_MANY_RECIPIENTS",
      statusCode: 400
    });

    const big = upload("grande.zip", "x", {
      size: MAX_OUTBOUND_ATTACHMENTS_BYTES + 1
    });
    await expect(send({ files: [big] })).rejects.toMatchObject({
      message: "ERR_EMAIL_ATTACHMENTS_TOO_LARGE",
      statusCode: 400
    });
    // a rejected request still removes its uploads from the public folder
    expect(fs.existsSync(big.path)).toBe(false);

    // forwarded originals count against the same budget
    Attachment.findAll.mockResolvedValue([
      {
        ...storeOriginal("a.png", "A"),
        size: MAX_OUTBOUND_ATTACHMENTS_BYTES
      }
    ]);
    await expect(
      send({ mode: "forward", to: "z@z.com", files: [upload("b.pdf", "B")] })
    ).rejects.toMatchObject({ message: "ERR_EMAIL_ATTACHMENTS_TOO_LARGE" });

    await expect(send({ body: "  " })).rejects.toMatchObject({
      message: "ERR_EMAIL_EMPTY_MESSAGE",
      statusCode: 400
    });
    await expect(send({ mode: "everyone" })).rejects.toMatchObject({
      message: "ERR_EMAIL_INVALID_MODE",
      statusCode: 400
    });
    expect(EM.create).not.toHaveBeenCalled();
    expect(enqueueEmailSend).not.toHaveBeenCalled();
  });

  it("rejects when company disabled or account not active", async () => {
    (assertEmailEnabled as jest.Mock).mockRejectedValueOnce(
      new AppError("ERR_EMAIL_CHANNEL_DISABLED", 403)
    );
    await expect(send()).rejects.toMatchObject({
      message: "ERR_EMAIL_CHANNEL_DISABLED",
      statusCode: 403
    });
    expect(assertEmailEnabled).toHaveBeenCalledWith(7);

    // eslint-disable-next-line no-restricted-syntax
    for (const found of [
      null,
      account({ status: "reauth_required" }),
      account({ status: "disabled" }),
      account({ status: "connecting" })
    ]) {
      Account.findOne.mockResolvedValueOnce(found);
      await expect(send()).rejects.toMatchObject({
        message: "ERR_EMAIL_ACCOUNT_UNAVAILABLE",
        statusCode: 409
      });
    }
    // the account is looked up inside the ticket's company
    expect(Account.findOne.mock.calls[0][0].where).toEqual({
      id: 3,
      companyId: 7
    });

    await expect(
      send({ ticket: ticket({ emailAccountId: null }) })
    ).rejects.toMatchObject({ message: "ERR_EMAIL_ACCOUNT_UNAVAILABLE" });
    await expect(
      send({ ticket: ticket({ channel: "whatsapp" }) })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(EM.create).not.toHaveBeenCalled();
  });

  it("returns the existing message for a repeated idempotencyKey without enqueueing", async () => {
    existingByKey = { id: 40, ticketId: 90, messageId: "old-msg" };
    const extra = upload("dup.pdf", "D");
    const result = await send({ files: [extra] });
    expect(result).toMatchObject({ id: "old-msg" });
    expect(EM.findOne.mock.calls[0][0].where).toEqual({
      companyId: 7,
      idempotencyKey: "key-1"
    });
    expect(EM.create).not.toHaveBeenCalled();
    expect(enqueueEmailSend).not.toHaveBeenCalled();
    expect(fs.existsSync(extra.path)).toBe(false);

    // the same key on another ticket is a conflict, never another ticket's data
    existingByKey = { id: 40, ticketId: 999, messageId: "old-msg" };
    await expect(send()).rejects.toMatchObject({
      message: "ERR_EMAIL_IDEMPOTENCY_CONFLICT",
      statusCode: 409
    });
  });

  it("re-queues a replayed email that is still queued (lost enqueue)", async () => {
    existingByKey = {
      id: 40,
      ticketId: 90,
      messageId: "old-msg",
      sendStatus: "queued",
      createdAt: new Date()
    };
    redis.exists.mockResolvedValue(0);
    await send();
    expect(enqueueEmailSend).toHaveBeenCalledWith(40);
    expect(redis.exists).toHaveBeenCalledWith(
      "email:send-inflight:40",
      "email:send-attempted:40"
    );
    expect(EM.create).not.toHaveBeenCalled();

    // never while a send attempt holds the marker, for old rows (marker
    // expired: a crashed attempt could have sent it) or finished rows
    (enqueueEmailSend as jest.Mock).mockClear();
    redis.exists.mockResolvedValue(1);
    await send();
    redis.exists.mockResolvedValue(0);
    existingByKey.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await send();
    existingByKey.createdAt = new Date();
    existingByKey.sendStatus = "sent";
    await send();
    expect(enqueueEmailSend).not.toHaveBeenCalled();

    // a failing re-enqueue still returns the existing message
    existingByKey.sendStatus = "queued";
    (enqueueEmailSend as jest.Mock).mockRejectedValueOnce(new Error("redis"));
    await expect(send()).resolves.toMatchObject({ id: "old-msg" });
  });

  it("does not re-queue a replay during a transient-retry backoff", async () => {
    existingByKey = {
      id: 40,
      ticketId: 90,
      messageId: "old-msg",
      sendStatus: "queued",
      createdAt: new Date()
    };
    // a try already ran and failed transiently: the in-flight marker was
    // released for the delayed retry, the attempt flag stays
    const present = new Set(["email:send-attempted:40"]);
    redis.exists.mockImplementation(
      async (...keys: string[]) => keys.filter(key => present.has(key)).length
    );
    await expect(send()).resolves.toMatchObject({ id: "old-msg" });
    expect(enqueueEmailSend).not.toHaveBeenCalled();

    // the lost-enqueue case (no try ever ran) is still re-queued
    present.clear();
    await send();
    expect(enqueueEmailSend).toHaveBeenCalledWith(40);
  });

  it("returns the winner when a concurrent request with the same key commits first", async () => {
    EM.create.mockImplementationOnce(async () => {
      existingByKey = { id: 40, ticketId: 90, messageId: "old-msg" };
      throw new UniqueConstraintError({
        fields: { idempotencyKey: "key-1" },
        parent: { constraint: "email_messages_idempotency_unique" } as any
      } as any);
    });
    const result = await send();
    expect(result).toMatchObject({ id: "old-msg" });
    expect(enqueueEmailSend).not.toHaveBeenCalled();
  });

  it("rejects a malformed idempotency key", async () => {
    await expect(send({ idempotencyKey: "a b\n" })).rejects.toMatchObject({
      message: "ERR_EMAIL_INVALID_IDEMPOTENCY_KEY",
      statusCode: 400
    });
  });

  it("marks the email failed when the send job cannot be queued", async () => {
    (enqueueEmailSend as jest.Mock).mockRejectedValue(new Error("redis down"));
    await send();
    expect(EM.update.mock.calls[0][0]).toEqual({
      sendStatus: "failed",
      sendError: { code: "ERR_EMAIL_TRANSIENT" }
    });
    expect(Msg.update.mock.calls[0][0]).toEqual({
      ack: -1,
      error: { code: "ERR_EMAIL_TRANSIENT" }
    });
  });
});
