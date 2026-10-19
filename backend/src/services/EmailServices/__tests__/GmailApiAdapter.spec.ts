/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { gmail } from "@googleapis/gmail";
import {
  getGmailAuthClient,
  persistRotatedRefreshToken
} from "../GmailAuthClient";
import { logger } from "../../../utils/logger";
import {
  EmailAuthError,
  EmailSendAmbiguousError,
  EmailSendRejectedError,
  EmailTransientError
} from "../adapters/errors";
import GmailApiAdapter, {
  GMAIL_INITIAL_QUERY,
  GMAIL_RAW_JSON_MAX_BYTES
} from "../adapters/GmailApiAdapter";
import { getAdapter } from "../adapters";
import {
  INITIAL_IMPORT_MAX,
  MAX_RAW_MESSAGE_BYTES,
  SYNC_BATCH_MAX
} from "../limits";
import type { OutgoingEmail } from "../types";

jest.mock("../../../utils/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));
jest.mock("@googleapis/gmail", () => ({ gmail: jest.fn() }));
jest.mock("../GmailAuthClient", () => ({
  getGmailAuthClient: jest.fn(),
  persistRotatedRefreshToken: jest.fn(),
  gmailFailureReason: (err: any) =>
    typeof err?.response?.status === "number"
      ? `HTTP_${err.response.status}`
      : err?.code || "UNKNOWN"
}));

// ---------------------------------------------------------------- fixtures

type StoredMessage = {
  threadId: string;
  labelIds: string[];
  raw?: string;
  sizeEstimate?: number;
  internalDate?: string;
  headers?: { name: string; value: string }[];
};

const store = new Map<string, StoredMessage>();

const httpError = (status: number, data?: unknown) =>
  Object.assign(new Error("Request failed"), {
    name: "GaxiosError",
    code: status,
    status,
    response: { status, data }
  });

const rawMail = (
  id: string,
  over: { from?: string; subject?: string; body?: string; date?: string } = {}
) =>
  [
    `From: ${over.from || "Cliente <cliente@example.com>"}`,
    "To: box@gmail.com",
    `Subject: ${over.subject || `Assunto ${id}`}`,
    `Message-ID: <${id}@example.com>`,
    ...(over.date === ""
      ? []
      : [`Date: ${over.date || "Mon, 19 Oct 2026 10:00:00 +0000"}`]),
    "Content-Type: text/plain; charset=utf-8",
    "",
    over.body || `Corpo ${id}`
  ].join("\r\n");

const addMessage = (
  id: string,
  over: Partial<StoredMessage> & { body?: string; date?: string } = {}
) => {
  const raw = rawMail(id, { body: over.body, date: over.date });
  store.set(id, {
    threadId: over.threadId || `t-${id}`,
    labelIds: over.labelIds || ["INBOX", "UNREAD"],
    raw: Buffer.from(raw).toString("base64url"),
    sizeEstimate: over.sizeEstimate ?? raw.length,
    internalDate: over.internalDate || "1792404000000",
    headers: over.headers || [
      { name: "From", value: "Cliente <cliente@example.com>" },
      { name: "To", value: "box@gmail.com" },
      { name: "Subject", value: `Grande ${id}` },
      { name: "Message-ID", value: `<${id}@example.com>` },
      { name: "Date", value: "Mon, 19 Oct 2026 10:00:00 +0000" }
    ]
  });
};

const api = {
  users: {
    getProfile: jest.fn(),
    history: { list: jest.fn() },
    messages: { list: jest.fn(), get: jest.fn(), send: jest.fn() }
  }
};

const getImpl = async (params: { id: string; format: string }) => {
  const message = store.get(params.id);
  if (!message) throw httpError(404, { error: { code: 404 } });
  const base = { id: params.id, threadId: message.threadId };
  if (params.format === "minimal") {
    return {
      data: {
        ...base,
        labelIds: message.labelIds,
        sizeEstimate: message.sizeEstimate,
        internalDate: message.internalDate
      }
    };
  }
  if (params.format === "metadata") {
    return {
      data: {
        ...base,
        labelIds: message.labelIds,
        payload: { headers: message.headers }
      }
    };
  }
  return { data: { ...base, labelIds: message.labelIds, raw: message.raw } };
};

const record = (id: number, messageId: string, labelIds = ["INBOX"]) => ({
  id: String(id),
  messagesAdded: [
    { message: { id: messageId, threadId: `t-${messageId}`, labelIds } }
  ]
});

const makeAccount = (cursor: unknown = null) =>
  ({
    id: 7,
    companyId: 3,
    address: "box@gmail.com",
    provider: "gmail_api",
    getDataValue: jest.fn((key: string) =>
      key === "syncCursor" ? cursor : undefined
    )
  }) as any;

const formatsRequested = (id: string) =>
  api.users.messages.get.mock.calls
    .filter(([params]) => params.id === id)
    .map(([params]) => params.format);

let authClient: { rotatedRefreshToken: string | null };
const adapter = new GmailApiAdapter();

beforeEach(() => {
  store.clear();
  jest.resetAllMocks();
  authClient = { rotatedRefreshToken: null };
  (getGmailAuthClient as jest.Mock).mockReturnValue(authClient);
  (gmail as unknown as jest.Mock).mockReturnValue(api);
  api.users.messages.get.mockImplementation(getImpl);
  api.users.messages.list.mockResolvedValue({ data: {} });
  api.users.history.list.mockResolvedValue({ data: { historyId: "1" } });
});

// ---------------------------------------------------------------- sync

describe("GmailApiAdapter.fetchChanges", () => {
  it("is registered for gmail_api accounts", () => {
    expect(getAdapter("gmail_api")).toBeInstanceOf(GmailApiAdapter);
  });

  it("initial import lists newer_than:1d max 50 then catches up via history from the saved historyId", async () => {
    api.users.getProfile.mockResolvedValue({
      data: { emailAddress: "box@gmail.com", historyId: "1000" }
    });
    ["m3", "m2", "m1", "late"].forEach(id => addMessage(id));
    // Gmail lists newest first, paginated.
    api.users.messages.list
      .mockResolvedValueOnce({
        data: { messages: [{ id: "m3" }, { id: "m2" }], nextPageToken: "p2" }
      })
      .mockResolvedValueOnce({ data: { messages: [{ id: "m1" }] } });
    api.users.history.list.mockResolvedValue({
      data: { history: [record(1001, "late")], historyId: "1005" }
    });

    const result = await adapter.fetchChanges(makeAccount(null));

    expect(api.users.getProfile).toHaveBeenCalledWith({ userId: "me" });
    expect(api.users.messages.list).toHaveBeenNthCalledWith(1, {
      userId: "me",
      q: GMAIL_INITIAL_QUERY,
      maxResults: INITIAL_IMPORT_MAX
    });
    expect(GMAIL_INITIAL_QUERY).toBe("newer_than:1d -in:chats");
    expect(INITIAL_IMPORT_MAX).toBe(50);
    expect(api.users.messages.list).toHaveBeenNthCalledWith(2, {
      userId: "me",
      q: GMAIL_INITIAL_QUERY,
      maxResults: INITIAL_IMPORT_MAX,
      pageToken: "p2"
    });
    // the historyId read before listing closes the race window
    expect(api.users.getProfile.mock.invocationCallOrder[0]).toBeLessThan(
      api.users.messages.list.mock.invocationCallOrder[0]
    );
    expect(api.users.history.list).toHaveBeenCalledWith({
      userId: "me",
      startHistoryId: "1000",
      historyTypes: ["messageAdded"],
      maxResults: SYNC_BATCH_MAX
    });
    expect(result.emails.map(e => e.providerMessageId)).toEqual([
      "m1",
      "m2",
      "m3",
      "late"
    ]);
    expect(result.emails[0]).toEqual(
      expect.objectContaining({
        accountId: 7,
        direction: "in",
        providerThreadId: "t-m1",
        internetMessageId: "<m1@example.com>",
        subject: "Assunto m1",
        from: { address: "cliente@example.com", name: "Cliente" }
      })
    );
    expect(result.cursor).toEqual({ historyId: "1005" });
    expect(result.hasMore).toBe(false);
  });

  it("incremental sync maps SENT label to direction out and skips DRAFT/SPAM", async () => {
    addMessage("in1");
    addMessage("out1", { labelIds: ["SENT"] });
    addMessage("draft1", { labelIds: ["DRAFT"] });
    // spam only known from the message itself (record without labels)
    addMessage("spam1", { labelIds: ["SPAM"] });
    addMessage("trash1", { labelIds: ["TRASH"] });
    api.users.history.list.mockResolvedValue({
      data: {
        history: [
          record(501, "in1"),
          record(502, "out1", ["SENT"]),
          record(503, "draft1", ["DRAFT"]),
          {
            id: "504",
            messagesAdded: [{ message: { id: "spam1", threadId: "t" } }]
          },
          record(505, "trash1", ["TRASH"])
        ],
        historyId: "510"
      }
    });

    const result = await adapter.fetchChanges(
      makeAccount({ historyId: "500" })
    );

    expect(api.users.getProfile).not.toHaveBeenCalled();
    expect(api.users.history.list).toHaveBeenCalledWith(
      expect.objectContaining({
        startHistoryId: "500",
        historyTypes: ["messageAdded"]
      })
    );
    expect(result.emails.map(e => [e.providerMessageId, e.direction])).toEqual([
      ["in1", "in"],
      ["out1", "out"]
    ]);
    expect(formatsRequested("draft1")).toEqual([]);
    expect(formatsRequested("trash1")).toEqual([]);
    expect(formatsRequested("spam1")).toEqual(["minimal"]);
    expect(result.cursor).toEqual({ historyId: "510" });
    expect(result.hasMore).toBe(false);
  });

  it("expired historyId (404) triggers a safe resync with the current historyId", async () => {
    addMessage("recent");
    api.users.history.list
      .mockRejectedValueOnce(httpError(404, { error: { code: 404 } }))
      .mockResolvedValueOnce({ data: { historyId: "9001" } });
    api.users.getProfile.mockResolvedValue({ data: { historyId: "9000" } });
    api.users.messages.list.mockResolvedValue({
      data: { messages: [{ id: "recent" }] }
    });

    const result = await adapter.fetchChanges(makeAccount({ historyId: "12" }));

    expect(api.users.history.list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ startHistoryId: "12" })
    );
    expect(api.users.messages.list).toHaveBeenCalledWith(
      expect.objectContaining({ q: GMAIL_INITIAL_QUERY })
    );
    expect(api.users.history.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ startHistoryId: "9000" })
    );
    expect(result.emails.map(e => e.providerMessageId)).toEqual(["recent"]);
    expect(result.cursor).toEqual({ historyId: "9001" });
  });

  it("does not loop when history keeps answering 404 after the resync", async () => {
    api.users.history.list.mockRejectedValue(httpError(404));
    api.users.getProfile.mockResolvedValue({ data: { historyId: "9000" } });

    await expect(
      adapter.fetchChanges(makeAccount({ historyId: "12" }))
    ).rejects.toBeInstanceOf(EmailTransientError);
    expect(api.users.history.list).toHaveBeenCalledTimes(2);
  });

  it("stops at SYNC_BATCH_MAX with hasMore and a resumable cursor", async () => {
    const records = Array.from({ length: 120 }, (_, i) => {
      addMessage(`h${i}`);
      return record(2000 + i, `h${i}`);
    });
    api.users.history.list.mockImplementation(
      async (params: { pageToken?: string }) =>
        params.pageToken
          ? { data: { history: records.slice(60), historyId: "9999" } }
          : {
              data: {
                history: records.slice(0, 60),
                nextPageToken: "page2",
                historyId: "9999"
              }
            }
    );

    const first = await adapter.fetchChanges(
      makeAccount({ historyId: "1999" })
    );

    expect(first.emails).toHaveLength(SYNC_BATCH_MAX);
    expect(first.emails[99].providerMessageId).toBe("h99");
    expect(first.hasMore).toBe(true);
    expect(first.cursor).toEqual({ historyId: "2099" });
    expect(formatsRequested("h100")).toEqual([]);

    api.users.history.list.mockClear();
    api.users.history.list.mockResolvedValue({
      data: { history: records.slice(100), historyId: "9999" }
    });
    const second = await adapter.fetchChanges(makeAccount(first.cursor));

    expect(api.users.history.list).toHaveBeenCalledWith(
      expect.objectContaining({ startHistoryId: "2099" })
    );
    expect(second.emails.map(e => e.providerMessageId)).toEqual(
      records.slice(100).map((_, i) => `h${100 + i}`)
    );
    expect(second.cursor).toEqual({ historyId: "9999" });
    expect(second.hasMore).toBe(false);
  });

  it("resumes an initial import cut by the byte budget from the pending ids", async () => {
    api.users.getProfile.mockResolvedValue({ data: { historyId: "300" } });
    // 40 MB each (estimate): the second does not fit in the 64 MB round.
    addMessage("big1", { sizeEstimate: 40 * 1024 * 1024 });
    addMessage("big2", { sizeEstimate: 40 * 1024 * 1024 });
    api.users.messages.list.mockResolvedValue({
      data: { messages: [{ id: "big2" }, { id: "big1" }] }
    });

    const first = await adapter.fetchChanges(makeAccount(null));

    expect(first.emails.map(e => e.providerMessageId)).toEqual(["big1"]);
    expect(first.cursor).toEqual({
      historyId: "300",
      initial: true,
      pending: ["big2"]
    });
    expect(first.hasMore).toBe(true);
    expect(api.users.history.list).not.toHaveBeenCalled();

    api.users.messages.list.mockClear();
    api.users.history.list.mockResolvedValue({ data: { historyId: "301" } });
    const second = await adapter.fetchChanges(makeAccount(first.cursor));

    expect(api.users.messages.list).not.toHaveBeenCalled();
    expect(second.emails.map(e => e.providerMessageId)).toEqual(["big2"]);
    expect(api.users.history.list).toHaveBeenCalledWith(
      expect.objectContaining({ startHistoryId: "300" })
    );
    expect(second.cursor).toEqual({ historyId: "301" });
    expect(second.hasMore).toBe(false);
  });

  it("imports an oversize message with headers only, flagged oversize", async () => {
    addMessage("huge", { sizeEstimate: MAX_RAW_MESSAGE_BYTES + 1 });
    api.users.history.list.mockResolvedValue({
      data: { history: [record(41, "huge")], historyId: "42" }
    });

    const result = await adapter.fetchChanges(makeAccount({ historyId: "40" }));

    expect(formatsRequested("huge")).toEqual(["minimal", "metadata"]);
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0]).toEqual(
      expect.objectContaining({
        providerMessageId: "huge",
        subject: "Grande huge",
        internetMessageId: "<huge@example.com>",
        from: { address: "cliente@example.com", name: "Cliente" },
        text: "",
        attachments: []
      })
    );
    expect(result.emails[0].htmlSanitized).toBeUndefined();
    expect(result.emails[0].flags).toEqual(
      expect.arrayContaining(["INBOX", "oversize"])
    );
  });

  it("falls back to the internal date when the message has no Date header", async () => {
    addMessage("nodate", { date: "", internalDate: "1792404000000" });
    api.users.history.list.mockResolvedValue({
      data: { history: [record(2, "nodate")], historyId: "3" }
    });

    const result = await adapter.fetchChanges(makeAccount({ historyId: "1" }));

    expect(result.emails[0].receivedAt.getTime()).toBe(1792404000000);
  });

  it("skips messages deleted between history and get (404) without failing the round", async () => {
    addMessage("kept");
    addMessage("goneLater");
    api.users.history.list.mockResolvedValue({
      data: {
        history: [
          record(11, "goneBefore"),
          record(12, "goneLater"),
          record(13, "kept")
        ],
        historyId: "14"
      }
    });
    const realGet = api.users.messages.get.getMockImplementation();
    api.users.messages.get.mockImplementation(async (params: any) => {
      // deleted after the minimal read, before the raw download
      if (params.id === "goneLater" && params.format === "raw") {
        throw httpError(404);
      }
      return realGet(params);
    });

    const result = await adapter.fetchChanges(makeAccount({ historyId: "10" }));

    expect(result.emails.map(e => e.providerMessageId)).toEqual(["kept"]);
    expect(result.cursor).toEqual({ historyId: "14" });
  });

  it("skips a message that cannot be parsed", async () => {
    addMessage("ok");
    store.set("broken", {
      threadId: "t",
      labelIds: ["INBOX"],
      raw: Buffer.from("x").toString("base64url"),
      sizeEstimate: 1
    });
    api.users.history.list.mockResolvedValue({
      data: {
        history: [record(2, "broken"), record(3, "ok")],
        historyId: "4"
      }
    });
    jest
      .spyOn(jest.requireActual("mailparser"), "simpleParser")
      .mockImplementationOnce(async () => {
        throw new Error("parse");
      });

    const result = await adapter.fetchChanges(makeAccount({ historyId: "1" }));

    expect(result.emails.map(e => e.providerMessageId)).toEqual(["ok"]);
  });

  it("maps 401 to EmailAuthError", async () => {
    api.users.history.list.mockRejectedValue(
      httpError(401, { error: { code: 401, status: "UNAUTHENTICATED" } })
    );
    await expect(
      adapter.fetchChanges(makeAccount({ historyId: "5" }))
    ).rejects.toBeInstanceOf(EmailAuthError);
  });

  it("maps a missing scope (403 insufficientPermissions) to EmailAuthError", async () => {
    api.users.history.list.mockRejectedValue(
      httpError(403, {
        error: { code: 403, errors: [{ reason: "insufficientPermissions" }] }
      })
    );
    await expect(
      adapter.fetchChanges(makeAccount({ historyId: "5" }))
    ).rejects.toBeInstanceOf(EmailAuthError);
  });

  it("passes through an auth error raised by the token refresh", async () => {
    api.users.history.list.mockRejectedValue(new EmailAuthError());
    await expect(
      adapter.fetchChanges(makeAccount({ historyId: "5" }))
    ).rejects.toBeInstanceOf(EmailAuthError);
  });

  it("maps 429 and 5xx to EmailTransientError without server text", async () => {
    api.users.history.list.mockRejectedValueOnce(httpError(429));
    const rate = await adapter
      .fetchChanges(makeAccount({ historyId: "5" }))
      .catch(e => e);
    expect(rate).toBeInstanceOf(EmailTransientError);
    expect(rate.message).toBe("ERR_EMAIL_TRANSIENT");
    expect(rate.reason).toBe("HTTP_429");

    api.users.messages.get.mockRejectedValue(httpError(503));
    api.users.history.list.mockResolvedValue({
      data: { history: [record(6, "x")], historyId: "7" }
    });
    const down = await adapter
      .fetchChanges(makeAccount({ historyId: "5" }))
      .catch(e => e);
    expect(down).toBeInstanceOf(EmailTransientError);
    expect(down.reason).toBe("HTTP_503");
  });

  it("starts an initial import when the stored cursor is not a Gmail cursor", async () => {
    api.users.getProfile.mockResolvedValue({ data: { historyId: "77" } });
    api.users.history.list.mockResolvedValue({ data: { historyId: "78" } });

    const result = await adapter.fetchChanges(
      makeAccount({ folders: { INBOX: { uidValidity: "1", lastUid: 3 } } })
    );

    expect(api.users.getProfile).toHaveBeenCalled();
    expect(result.cursor).toEqual({ historyId: "78" });
  });

  it("persists a rotated refresh token only in afterRound", async () => {
    api.users.history.list.mockImplementation(async () => {
      authClient.rotatedRefreshToken = "new-token";
      return { data: { historyId: "9" } };
    });
    const account = makeAccount({ historyId: "8" });

    await adapter.fetchChanges(account);
    expect(persistRotatedRefreshToken).not.toHaveBeenCalled();

    await adapter.afterRound(account);
    expect(persistRotatedRefreshToken).toHaveBeenCalledWith(
      account,
      authClient
    );
  });
});

// ---------------------------------------------------------------- send

const outgoing = (over: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  from: { address: "box@gmail.com", name: "Loja" },
  to: [{ address: "cliente@example.com", name: "Cliente" }],
  cc: [],
  subject: "Re: Pedido",
  text: "Olá",
  html: "<p>Olá</p>",
  messageId: "<out-1@ticketz.local>",
  inReplyTo: "<in-1@example.com>",
  references: ["<in-1@example.com>"],
  attachments: [],
  providerThreadId: "thread-9",
  ...over
});

describe("GmailApiAdapter.send", () => {
  it("send posts base64url raw with threadId and returns ids", async () => {
    api.users.messages.send.mockResolvedValue({
      data: { id: "gm-1", threadId: "thread-9" }
    });

    const result = await adapter.send(makeAccount(), outgoing());

    expect(result).toEqual({
      providerMessageId: "gm-1",
      providerThreadId: "thread-9"
    });
    const [params, options] = api.users.messages.send.mock.calls[0];
    expect(params.userId).toBe("me");
    expect(params.requestBody.threadId).toBe("thread-9");
    expect(params.requestBody.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(options).toEqual(expect.objectContaining({ retry: false }));
    const mime = Buffer.from(params.requestBody.raw, "base64url").toString();
    expect(mime).toMatch(/^Message-ID: <out-1@ticketz\.local>\r?$/im);
    expect(mime).toMatch(/^In-Reply-To: <in-1@example\.com>\r?$/im);
    expect(mime).toMatch(/^References: <in-1@example\.com>\r?$/im);
    expect(mime).toMatch(/^To: Cliente <cliente@example\.com>\r?$/im);
    expect(mime).toMatch(/^From: Loja <box@gmail\.com>\r?$/im);
    expect(mime).not.toMatch(/^Bcc:/im);
  });

  it("sends without threadId for a new conversation", async () => {
    api.users.messages.send.mockResolvedValue({ data: { id: "gm-2" } });
    await adapter.send(
      makeAccount(),
      outgoing({ providerThreadId: undefined })
    );
    const [params] = api.users.messages.send.mock.calls[0];
    expect(params.requestBody).not.toHaveProperty("threadId");
  });

  it("uploads a large message as message/rfc822 media instead of JSON raw", async () => {
    api.users.messages.send.mockResolvedValue({
      data: { id: "gm-3", threadId: "thread-9" }
    });
    // An attachment is base64-encoded quickly (a huge text body is not).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmail-send-"));
    const file = path.join(dir, "big.bin");
    fs.writeFileSync(
      file,
      crypto.randomBytes(GMAIL_RAW_JSON_MAX_BYTES).toString("latin1"),
      "latin1"
    );

    try {
      await adapter.send(
        makeAccount(),
        outgoing({
          attachments: [
            {
              filename: "big.bin",
              contentType: "application/octet-stream",
              path: file
            }
          ]
        })
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    const [params] = api.users.messages.send.mock.calls[0];
    expect(params.requestBody).toEqual({ threadId: "thread-9" });
    expect(params.media.mimeType).toBe("message/rfc822");
    expect(params.media.body).toBeInstanceOf(Readable);
  }, 20000);

  it("send maps 403 to rejected, 503 to transient and a socket timeout to ambiguous", async () => {
    api.users.messages.send.mockRejectedValueOnce(
      httpError(403, {
        error: { code: 403, errors: [{ reason: "forbidden" }] }
      })
    );
    const rejected = await adapter
      .send(makeAccount(), outgoing())
      .catch(e => e);
    expect(rejected).toBeInstanceOf(EmailSendRejectedError);
    expect(rejected.code).toBe("ERR_GMAIL_SEND_403");

    api.users.messages.send.mockRejectedValueOnce(httpError(503));
    const transient = await adapter
      .send(makeAccount(), outgoing())
      .catch(e => e);
    expect(transient).toBeInstanceOf(EmailTransientError);

    const abort = Object.assign(new Error("This operation was aborted"), {
      name: "AbortError"
    });
    api.users.messages.send.mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "GaxiosError", error: abort })
    );
    const timedOut = await adapter
      .send(makeAccount(), outgoing())
      .catch(e => e);
    expect(timedOut).toBeInstanceOf(EmailSendAmbiguousError);

    api.users.messages.send.mockRejectedValueOnce(
      Object.assign(new Error("socket hang up"), {
        name: "GaxiosError",
        code: "ECONNRESET"
      })
    );
    const reset = await adapter.send(makeAccount(), outgoing()).catch(e => e);
    expect(reset).toBeInstanceOf(EmailSendAmbiguousError);
  });

  it("maps 400 to rejected, 429 to transient and a refused connection to transient", async () => {
    api.users.messages.send.mockRejectedValueOnce(httpError(400));
    const bad = await adapter.send(makeAccount(), outgoing()).catch(e => e);
    expect(bad).toBeInstanceOf(EmailSendRejectedError);
    expect(bad.code).toBe("ERR_GMAIL_SEND_400");
    expect(bad.reason).toBe("400");

    api.users.messages.send.mockRejectedValueOnce(httpError(429));
    expect(
      await adapter.send(makeAccount(), outgoing()).catch(e => e)
    ).toBeInstanceOf(EmailTransientError);

    api.users.messages.send.mockRejectedValueOnce(
      Object.assign(new Error("connect"), {
        name: "GaxiosError",
        code: "ECONNREFUSED"
      })
    );
    expect(
      await adapter.send(makeAccount(), outgoing()).catch(e => e)
    ).toBeInstanceOf(EmailTransientError);
  });

  it("treats a 403 rate limit as transient and a missing scope or 401 as auth", async () => {
    api.users.messages.send.mockRejectedValueOnce(
      httpError(403, {
        error: { code: 403, errors: [{ reason: "userRateLimitExceeded" }] }
      })
    );
    expect(
      await adapter.send(makeAccount(), outgoing()).catch(e => e)
    ).toBeInstanceOf(EmailTransientError);

    api.users.messages.send.mockRejectedValueOnce(
      httpError(403, {
        error: {
          code: 403,
          details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }]
        }
      })
    );
    expect(
      await adapter.send(makeAccount(), outgoing()).catch(e => e)
    ).toBeInstanceOf(EmailAuthError);

    api.users.messages.send.mockRejectedValueOnce(httpError(401));
    expect(
      await adapter.send(makeAccount(), outgoing()).catch(e => e)
    ).toBeInstanceOf(EmailAuthError);
  });

  it("resends without threadId when Gmail no longer has the thread (404)", async () => {
    api.users.messages.send
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce({ data: { id: "gm-4", threadId: "new-thread" } });

    const result = await adapter.send(makeAccount(), outgoing());

    expect(api.users.messages.send).toHaveBeenCalledTimes(2);
    expect(
      api.users.messages.send.mock.calls[1][0].requestBody
    ).not.toHaveProperty("threadId");
    expect(result).toEqual({
      providerMessageId: "gm-4",
      providerThreadId: "new-thread"
    });
  });

  it("refuses a missing attachment file before calling Gmail", async () => {
    const err = await adapter
      .send(
        makeAccount(),
        outgoing({
          attachments: [
            {
              filename: "a.pdf",
              contentType: "application/pdf",
              path: "/nonexistent/a.pdf"
            }
          ]
        })
      )
      .catch(e => e);
    expect(err).toBeInstanceOf(EmailSendRejectedError);
    expect(err.code).toBe("ERR_EMAIL_INVALID_MESSAGE");
    expect(api.users.messages.send).not.toHaveBeenCalled();
  });

  it("persists a rotated refresh token after the send", async () => {
    api.users.messages.send.mockImplementation(async () => {
      authClient.rotatedRefreshToken = "rotated";
      return { data: { id: "gm-5" } };
    });
    const account = makeAccount();
    await adapter.send(account, outgoing());
    expect(persistRotatedRefreshToken).toHaveBeenCalledWith(
      account,
      authClient
    );
  });

  it("never logs the Gaxios error object", async () => {
    const secret = Object.assign(new Error("boom"), {
      name: "Weird",
      config: { headers: { Authorization: "Bearer secret-token" } }
    });
    api.users.messages.send.mockRejectedValueOnce(secret);
    await adapter.send(makeAccount(), outgoing()).catch(() => undefined);
    const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("boom");
  });
});
