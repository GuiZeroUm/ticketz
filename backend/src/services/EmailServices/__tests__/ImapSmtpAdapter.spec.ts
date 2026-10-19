/* eslint-disable @typescript-eslint/no-explicit-any, no-restricted-syntax */
import fs from "fs";
import os from "os";
import path from "path";
import AppError from "../../../errors/AppError";
import { logger } from "../../../utils/logger";
import { resolveSafeMailEndpoint } from "../mailEndpoint";
import {
  EmailAuthError,
  EmailSendAmbiguousError,
  EmailSendRejectedError,
  EmailTransientError
} from "../adapters/errors";
import ImapSmtpAdapter, { testImapSmtp } from "../adapters/ImapSmtpAdapter";
import { getAdapter } from "../adapters";
import { INITIAL_IMPORT_MAX, SYNC_BATCH_MAX } from "../limits";
import type { OutgoingEmail } from "../types";

jest.mock("../../../utils/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

jest.mock("../mailEndpoint", () => ({
  resolveSafeMailEndpoint: jest.fn()
}));

type FakeMessage = {
  uid: number;
  internalDate: Date;
  flags?: string[];
  source: Buffer;
};

type FakeFolder = {
  uidValidity: bigint;
  uidNext: number;
  specialUse?: string;
  messages: FakeMessage[];
};

const fakeServer = {
  folders: {} as Record<string, FakeFolder>,
  options: [] as Record<string, unknown>[],
  opened: [] as string[],
  connectError: null as Error | null,
  logouts: 0,
  reset() {
    this.folders = {};
    this.options = [];
    this.opened = [];
    this.connectError = null;
    this.logouts = 0;
  }
};

// Day granularity like a real IMAP SINCE, so the adapter has to filter by the
// exact internal date itself.
const dayStart = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

jest.mock("imapflow", () => ({
  ImapFlow: class FakeImapFlow {
    mailbox: unknown = false;

    constructor(options: Record<string, unknown>) {
      fakeServer.options.push(options);
    }

    on() {
      return this;
    }

    async connect() {
      if (fakeServer.connectError) throw fakeServer.connectError;
    }

    async logout() {
      fakeServer.logouts += 1;
    }

    close() {
      /* noop */
    }

    async list() {
      return Object.entries(fakeServer.folders).map(([p, f]) => ({
        path: p,
        specialUse: f.specialUse
      }));
    }

    async getMailboxLock(p: string) {
      const folder = fakeServer.folders[p];
      if (!folder) throw new Error("no such mailbox");
      fakeServer.opened.push(p);
      this.mailbox = {
        path: p,
        uidValidity: folder.uidValidity,
        uidNext: folder.uidNext
      };
      return { release: jest.fn() };
    }

    private folder() {
      return fakeServer.folders[(this.mailbox as { path: string }).path];
    }

    async search(query: { since?: Date; uid?: string }) {
      const { messages } = this.folder();
      if (query.since) {
        const floor = dayStart(query.since);
        return messages
          .filter(m => m.internalDate.getTime() >= floor)
          .map(m => m.uid);
      }
      if (query.uid) {
        const from = Number(query.uid.split(":")[0]);
        const hit = messages.filter(m => m.uid >= from).map(m => m.uid);
        // A real "N:*" range always includes the highest UID in the mailbox.
        if (!hit.length && messages.length) {
          return [messages[messages.length - 1].uid];
        }
        return hit;
      }
      return messages.map(m => m.uid);
    }

    async fetchAll(range: string) {
      const wanted = new Set(range.split(",").map(Number));
      return this.folder()
        .messages.filter(m => wanted.has(m.uid))
        .map(m => ({
          uid: m.uid,
          internalDate: m.internalDate,
          flags: new Set(m.flags || [])
        }));
    }

    async *fetch(range: string) {
      const wanted = new Set(range.split(",").map(Number));
      for (const m of this.folder().messages) {
        if (wanted.has(m.uid)) {
          yield {
            uid: m.uid,
            internalDate: m.internalDate,
            flags: new Set(m.flags || []),
            source: m.source
          };
        }
      }
    }
  }
}));

const smtpState = {
  transports: [] as { options: Record<string, any>; sent: any[] }[],
  sendImpl: null as null | ((mail: any, options: Record<string, any>) => any),
  verifyImpl: null as null | (() => Promise<unknown>)
};

jest.mock("nodemailer", () => ({
  createTransport: (options: Record<string, any>) => {
    const record = { options, sent: [] as any[] };
    smtpState.transports.push(record);
    return {
      sendMail: async (mail: any) => {
        record.sent.push(mail);
        if (smtpState.sendImpl) return smtpState.sendImpl(mail, options);
        return { messageId: mail.messageId, accepted: ["a@b.com"] };
      },
      verify: async () => {
        if (smtpState.verifyImpl) return smtpState.verifyImpl();
        return true;
      },
      close: jest.fn()
    };
  }
}));

const resolveMock = resolveSafeMailEndpoint as jest.Mock;

const NOW = new Date("2026-10-19T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

const raw = (id: string, from = "carla@cliente.com", extra = "") =>
  Buffer.from(
    `From: Carla <${from}>\r\nTo: loja@empresa.com\r\nSubject: Assunto ${id}\r\n` +
      `Message-ID: <${id}@cliente.com>\r\nDate: Mon, 19 Oct 2026 10:00:00 +0000\r\n` +
      `${extra}\r\nCorpo ${id}\r\n`
  );

const msg = (
  uid: number,
  hours: number,
  flags: string[] = []
): FakeMessage => ({
  uid,
  internalDate: hoursAgo(hours),
  flags,
  source: raw(`m${uid}`)
});

const makeAccount = (
  cursor: unknown = null,
  over: Record<string, unknown> = {}
) =>
  ({
    id: 5,
    address: "loja@empresa.com",
    imapHost: "imap.empresa.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.empresa.com",
    smtpPort: 587,
    smtpSecure: false,
    getCredentials: () => ({ password: "s3cret-pass" }),
    getDataValue: (key: string) => (key === "syncCursor" ? cursor : undefined),
    ...over
  }) as any;

const adapter = new ImapSmtpAdapter();

const outgoing = (over: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  from: { address: "loja@empresa.com", name: "Loja" },
  to: [{ address: "carla@cliente.com", name: "Carla" }],
  cc: [],
  subject: "Re: Orçamento",
  text: "olá",
  html: "<p>olá</p>",
  messageId: "<out-1@empresa.com>",
  inReplyTo: "<in-1@cliente.com>",
  references: ["<in-1@cliente.com>"],
  attachments: [],
  ...over
});

// Mimics how nodemailer reports the client commands to a custom logger.
const logClient = (options: Record<string, any>, command: string) =>
  options.logger.debug({ tnx: "client" }, command);

beforeEach(() => {
  fakeServer.reset();
  smtpState.transports = [];
  smtpState.sendImpl = null;
  smtpState.verifyImpl = null;
  resolveMock.mockReset();
  resolveMock.mockImplementation(async ({ host, port }) => ({
    address: "203.0.113.10",
    servername: host,
    port
  }));
  jest.spyOn(Date, "now").mockReturnValue(NOW.getTime());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ImapSmtpAdapter.fetchChanges", () => {
  it("first sync imports only the last 24h, at most 50, and records uidValidity/lastUid per folder", async () => {
    const messages: FakeMessage[] = [];
    // 3 old messages (the 30h one still falls on the same SINCE day), then 60 recent
    messages.push(msg(1, 100), msg(2, 30), msg(3, 25));
    for (let i = 0; i < 60; i += 1) messages.push(msg(10 + i, 1));
    fakeServer.folders.INBOX = {
      uidValidity: 777n,
      uidNext: 100,
      messages
    };

    const result = await adapter.fetchChanges(makeAccount());

    expect(result.emails).toHaveLength(INITIAL_IMPORT_MAX);
    expect(result.emails.every(e => e.receivedAt instanceof Date)).toBe(true);
    // the 50 most recent, oldest first
    expect(result.emails[0].providerMessageId).toBe("INBOX:777:20");
    expect(result.emails[49].providerMessageId).toBe("INBOX:777:69");
    expect(
      result.emails.some(e => /^INBOX:777:[123]$/.test(e.providerMessageId))
    ).toBe(false);
    expect(result.cursor).toEqual({
      folders: { INBOX: { uidValidity: "777", lastUid: 69 } }
    });
    expect(result.hasMore).toBe(false);
  });

  it("first sync of an empty window starts after uidNext - 1", async () => {
    fakeServer.folders.INBOX = {
      uidValidity: 9n,
      uidNext: 40,
      messages: [msg(5, 200)]
    };
    const result = await adapter.fetchChanges(makeAccount());
    expect(result.emails).toHaveLength(0);
    expect(result.cursor).toEqual({
      folders: { INBOX: { uidValidity: "9", lastUid: 39 } }
    });
  });

  it("next sync fetches UID > lastUid and sets hasMore over 100", async () => {
    const messages: FakeMessage[] = [];
    for (let i = 1; i <= 130; i += 1) messages.push(msg(i, 1));
    fakeServer.folders.INBOX = { uidValidity: 777n, uidNext: 131, messages };
    const cursor = { folders: { INBOX: { uidValidity: "777", lastUid: 10 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    expect(result.emails).toHaveLength(SYNC_BATCH_MAX);
    expect(result.emails[0].providerMessageId).toBe("INBOX:777:11");
    expect(result.emails[99].providerMessageId).toBe("INBOX:777:110");
    expect(result.cursor).toEqual({
      folders: { INBOX: { uidValidity: "777", lastUid: 110 } }
    });
    expect(result.hasMore).toBe(true);

    const next = await adapter.fetchChanges(makeAccount(result.cursor));
    expect(next.emails).toHaveLength(20);
    expect(next.cursor.folders).toEqual({
      INBOX: { uidValidity: "777", lastUid: 130 }
    });
    expect(next.hasMore).toBe(false);
  });

  it("defers a folder that has no budget left in the batch instead of importing it unbounded", async () => {
    const inbox: FakeMessage[] = [];
    for (let i = 1; i <= 120; i += 1) inbox.push(msg(i, 1));
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 121,
      messages: inbox
    };
    fakeServer.folders.Sent = {
      uidValidity: 2n,
      uidNext: 4,
      specialUse: "\\Sent",
      messages: [msg(3, 1)]
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    expect(result.emails).toHaveLength(SYNC_BATCH_MAX);
    expect(result.hasMore).toBe(true);
    expect(result.cursor.folders).toEqual({
      INBOX: { uidValidity: "1", lastUid: 100 }
    });
    expect(fakeServer.opened).not.toContain("Sent");
  });

  it("does not re-deliver the last message when nothing is new (N:* quirk)", async () => {
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 8,
      messages: [msg(6, 1), msg(7, 1)]
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 7 } } };
    const result = await adapter.fetchChanges(makeAccount(cursor));
    expect(result.emails).toHaveLength(0);
    expect(result.cursor).toEqual(cursor);
    expect(result.hasMore).toBe(false);
  });

  it("resets a folder cursor when UIDVALIDITY changes without reimporting history", async () => {
    const messages: FakeMessage[] = [];
    for (let i = 1; i <= 30; i += 1) messages.push(msg(i, 1));
    fakeServer.folders.INBOX = { uidValidity: 2n, uidNext: 31, messages };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 500 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    expect(result.emails).toHaveLength(0);
    expect(result.cursor).toEqual({
      folders: { INBOX: { uidValidity: "2", lastUid: 30 } }
    });
    expect(result.hasMore).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 5, folder: "INBOX" }),
      expect.stringContaining("UIDVALIDITY")
    );

    // mail that arrives afterwards is picked up with the new validity
    fakeServer.folders.INBOX.messages.push(msg(31, 0));
    fakeServer.folders.INBOX.uidNext = 32;
    const next = await adapter.fetchChanges(makeAccount(result.cursor));
    expect(next.emails.map(e => e.providerMessageId)).toEqual(["INBOX:2:31"]);
  });

  it("marks Sent folder messages as direction 'out' and keeps a cursor per folder", async () => {
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 3,
      messages: [msg(2, 1, ["\\Seen"])]
    };
    fakeServer.folders["[Gmail]/Enviados"] = {
      uidValidity: 4n,
      uidNext: 8,
      specialUse: "\\Sent",
      messages: [msg(7, 2)]
    };
    fakeServer.folders.Lixeira = {
      uidValidity: 5n,
      uidNext: 2,
      specialUse: "\\Trash",
      messages: [msg(1, 1)]
    };

    const result = await adapter.fetchChanges(makeAccount());

    const byId = Object.fromEntries(
      result.emails.map(e => [e.providerMessageId, e])
    );
    expect(Object.keys(byId).sort()).toEqual([
      "INBOX:1:2",
      "[Gmail]/Enviados:4:7"
    ]);
    expect(byId["INBOX:1:2"].direction).toBe("in");
    expect(byId["INBOX:1:2"].flags).toContain("\\Seen");
    expect(byId["[Gmail]/Enviados:4:7"].direction).toBe("out");
    expect(byId["INBOX:1:2"]).toMatchObject({
      accountId: 5,
      subject: "Assunto m2",
      from: { address: "carla@cliente.com" },
      internetMessageId: "<m2@cliente.com>"
    });
    expect(result.cursor.folders).toEqual({
      INBOX: { uidValidity: "1", lastUid: 2 },
      "[Gmail]/Enviados": { uidValidity: "4", lastUid: 7 }
    });
    expect(fakeServer.opened).not.toContain("Lixeira");
  });

  it("passes through messages without a usable sender (ruling R16)", async () => {
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 2,
      messages: [
        {
          uid: 1,
          internalDate: hoursAgo(1),
          source: Buffer.from(
            "To: loja@empresa.com\r\nSubject: sem from\r\n\r\ncorpo\r\n"
          )
        }
      ]
    };
    const result = await adapter.fetchChanges(makeAccount());
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].from.address).toBe("");
  });

  it("keeps previous cursor entries for folders that were not visited", async () => {
    fakeServer.folders.INBOX = { uidValidity: 1n, uidNext: 2, messages: [] };
    const cursor = {
      folders: {
        INBOX: { uidValidity: "1", lastUid: 1 },
        Enviados: { uidValidity: "3", lastUid: 9 }
      }
    };
    const result = await adapter.fetchChanges(makeAccount(cursor));
    expect((result.cursor.folders as any).Enviados).toEqual({
      uidValidity: "3",
      lastUid: 9
    });
  });

  it("maps an IMAP AUTHENTICATIONFAILED to EmailAuthError without leaking the password", async () => {
    fakeServer.connectError = Object.assign(new Error("Invalid credentials"), {
      authenticationFailed: true,
      serverResponseCode: "AUTHENTICATIONFAILED"
    });
    const error = await adapter.fetchChanges(makeAccount()).catch(e => e);
    expect(error).toBeInstanceOf(EmailAuthError);
    expect(JSON.stringify(error.message)).not.toContain("s3cret-pass");
  });

  it("maps network failures to EmailTransientError", async () => {
    fakeServer.connectError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED"
    });
    await expect(adapter.fetchChanges(makeAccount())).rejects.toBeInstanceOf(
      EmailTransientError
    );
  });

  it("connects to the resolved IP with servername set to the hostname, over TLS", async () => {
    fakeServer.folders.INBOX = { uidValidity: 1n, uidNext: 2, messages: [] };
    await adapter.fetchChanges(makeAccount());

    expect(resolveMock).toHaveBeenCalledWith({
      host: "imap.empresa.com",
      port: 993,
      kind: "imap"
    });
    const [options] = fakeServer.options;
    expect(options).toMatchObject({
      host: "203.0.113.10",
      port: 993,
      secure: true,
      servername: "imap.empresa.com",
      auth: { user: "loja@empresa.com", pass: "s3cret-pass" },
      logger: false
    });
    expect(options.tls).toMatchObject({ servername: "imap.empresa.com" });
    expect(options.doSTARTTLS).toBeUndefined();
    expect(fakeServer.logouts).toBe(1);
  });

  it("requires STARTTLS when the IMAP connection is not implicit TLS", async () => {
    fakeServer.folders.INBOX = { uidValidity: 1n, uidNext: 2, messages: [] };
    await adapter.fetchChanges(
      makeAccount(null, { imapPort: 143, imapSecure: false })
    );
    expect(fakeServer.options[0]).toMatchObject({
      secure: false,
      doSTARTTLS: true
    });
  });

  it("propagates a refused endpoint as is and never connects", async () => {
    resolveMock.mockRejectedValue(
      new AppError("ERR_EMAIL_HOST_NOT_ALLOWED", 400)
    );
    await expect(adapter.fetchChanges(makeAccount())).rejects.toBeInstanceOf(
      AppError
    );
    expect(fakeServer.options).toHaveLength(0);
  });

  it("reports missing credentials as an auth error", async () => {
    const account = makeAccount(null, { getCredentials: () => null });
    await expect(adapter.fetchChanges(account)).rejects.toBeInstanceOf(
      EmailAuthError
    );
  });
});

describe("ImapSmtpAdapter.send", () => {
  it("sends through the resolved IP with servername, STARTTLS required on 587", async () => {
    const result = await adapter.send(makeAccount(), outgoing());

    expect(result).toEqual({});
    expect(resolveMock).toHaveBeenCalledWith({
      host: "smtp.empresa.com",
      port: 587,
      kind: "smtp"
    });
    const [{ options, sent }] = smtpState.transports;
    expect(options).toMatchObject({
      host: "203.0.113.10",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: "loja@empresa.com", pass: "s3cret-pass" }
    });
    expect(options.tls).toMatchObject({ servername: "smtp.empresa.com" });
    expect(sent[0]).toMatchObject({
      messageId: "<out-1@empresa.com>",
      inReplyTo: "<in-1@cliente.com>",
      references: ["<in-1@cliente.com>"],
      subject: "Re: Orçamento",
      text: "olá",
      html: "<p>olá</p>"
    });
    expect(sent[0].from).toEqual({ name: "Loja", address: "loja@empresa.com" });
    expect(sent[0].to).toEqual([
      { name: "Carla", address: "carla@cliente.com" }
    ]);
  });

  it("uses implicit TLS on 465", async () => {
    await adapter.send(
      makeAccount(null, { smtpPort: 465, smtpSecure: true }),
      outgoing()
    );
    expect(smtpState.transports[0].options).toMatchObject({
      port: 465,
      secure: true
    });
    expect(smtpState.transports[0].options.requireTLS).toBeFalsy();
  });

  it("attaches files by path", async () => {
    const file = path.join(os.tmpdir(), `adapter-att-${process.pid}.txt`);
    fs.writeFileSync(file, "x");
    try {
      await adapter.send(
        makeAccount(),
        outgoing({
          attachments: [
            { filename: "a.txt", contentType: "text/plain", path: file }
          ]
        })
      );
      expect(smtpState.transports[0].sent[0].attachments).toEqual([
        { filename: "a.txt", contentType: "text/plain", path: file }
      ]);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it("refuses with a definitive error when an attachment file is missing, before connecting", async () => {
    const error = await adapter
      .send(
        makeAccount(),
        outgoing({
          attachments: [
            {
              filename: "a.txt",
              contentType: "text/plain",
              path: "/nonexistent/a.txt"
            }
          ]
        })
      )
      .catch(e => e);
    expect(error).toBeInstanceOf(EmailSendRejectedError);
    expect(error.code).toBe("ERR_EMAIL_ATTACHMENT_MISSING");
    expect(smtpState.transports).toHaveLength(0);
  });

  it("maps 550 to EmailSendRejectedError", async () => {
    smtpState.sendImpl = () =>
      Promise.reject(
        Object.assign(new Error("Message failed: 550 no such user"), {
          code: "EENVELOPE",
          command: "RCPT TO",
          responseCode: 550
        })
      );
    const error = await adapter.send(makeAccount(), outgoing()).catch(e => e);
    expect(error).toBeInstanceOf(EmailSendRejectedError);
    expect(error.code).toBe("ERR_EMAIL_REJECTED_550");
  });

  it("maps a 5xx after the message body to EmailSendRejectedError", async () => {
    smtpState.sendImpl = (_mail, options) => {
      logClient(options, "DATA");
      return Promise.reject(
        Object.assign(new Error("Message failed"), {
          code: "EMESSAGE",
          command: "DATA",
          responseCode: 554
        })
      );
    };
    const error = await adapter.send(makeAccount(), outgoing()).catch(e => e);
    expect(error).toBeInstanceOf(EmailSendRejectedError);
    expect(error.code).toBe("ERR_EMAIL_REJECTED_554");
  });

  it("maps ECONNREFUSED to EmailTransientError", async () => {
    smtpState.sendImpl = () =>
      Promise.reject(
        Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED"
        })
      );
    await expect(
      adapter.send(makeAccount(), outgoing())
    ).rejects.toBeInstanceOf(EmailTransientError);
  });

  it("maps a connection timeout before DATA to EmailTransientError", async () => {
    smtpState.sendImpl = () =>
      Promise.reject(
        Object.assign(new Error("Connection timeout"), {
          code: "ETIMEDOUT",
          command: "CONN"
        })
      );
    await expect(
      adapter.send(makeAccount(), outgoing())
    ).rejects.toBeInstanceOf(EmailTransientError);
  });

  it("maps a 4xx reply to EmailTransientError", async () => {
    smtpState.sendImpl = (_mail, options) => {
      logClient(options, "DATA");
      return Promise.reject(
        Object.assign(new Error("Message failed"), {
          code: "EMESSAGE",
          command: "DATA",
          responseCode: 451
        })
      );
    };
    await expect(
      adapter.send(makeAccount(), outgoing())
    ).rejects.toBeInstanceOf(EmailTransientError);
  });

  it("maps a timeout after DATA to EmailSendAmbiguousError", async () => {
    smtpState.sendImpl = (_mail, options) => {
      logClient(options, "MAIL FROM:<loja@empresa.com>");
      logClient(options, "DATA");
      return Promise.reject(
        Object.assign(new Error("Timeout"), {
          code: "ETIMEDOUT",
          command: "CONN"
        })
      );
    };
    await expect(
      adapter.send(makeAccount(), outgoing())
    ).rejects.toBeInstanceOf(EmailSendAmbiguousError);
  });

  it("maps a dropped connection after DATA to EmailSendAmbiguousError", async () => {
    smtpState.sendImpl = (_mail, options) => {
      logClient(options, "DATA");
      return Promise.reject(
        Object.assign(new Error("Connection closed unexpectedly"), {
          code: "ECONNECTION",
          command: "CONN"
        })
      );
    };
    await expect(
      adapter.send(makeAccount(), outgoing())
    ).rejects.toBeInstanceOf(EmailSendAmbiguousError);
  });

  it("maps authentication failures to EmailAuthError", async () => {
    smtpState.sendImpl = () =>
      Promise.reject(
        Object.assign(new Error("Invalid login"), {
          code: "EAUTH",
          command: "AUTH PLAIN",
          responseCode: 535
        })
      );
    const error = await adapter.send(makeAccount(), outgoing()).catch(e => e);
    expect(error).toBeInstanceOf(EmailAuthError);
    expect(error.message).not.toContain("s3cret-pass");
  });

  it("never exposes the underlying server text or credentials in error messages", async () => {
    smtpState.sendImpl = () =>
      Promise.reject(
        Object.assign(new Error("550 secret server text s3cret-pass"), {
          responseCode: 550,
          command: "RCPT TO"
        })
      );
    const error = await adapter.send(makeAccount(), outgoing()).catch(e => e);
    expect(error.message).not.toContain("s3cret-pass");
    expect(error.message).not.toContain("secret server text");
  });
});

describe("getAdapter", () => {
  it("returns the IMAP/SMTP adapter for imap_smtp", () => {
    expect(getAdapter("imap_smtp")).toBeInstanceOf(ImapSmtpAdapter);
  });

  it("refuses an unregistered provider", () => {
    expect(() => getAdapter("gmail_api")).toThrow();
  });
});

describe("testImapSmtp", () => {
  const config = {
    address: "loja@empresa.com",
    password: "s3cret-pass",
    imap: { host: "imap.empresa.com", port: 993, secure: true },
    smtp: { host: "smtp.empresa.com", port: 587, secure: false }
  };

  it("resolves when IMAP login and SMTP verify succeed, using the resolved IPs", async () => {
    await expect(testImapSmtp(config)).resolves.toBeUndefined();
    expect(fakeServer.options[0]).toMatchObject({
      host: "203.0.113.10",
      servername: "imap.empresa.com"
    });
    expect(smtpState.transports[0].options).toMatchObject({
      host: "203.0.113.10",
      requireTLS: true
    });
    expect(fakeServer.logouts).toBe(1);
  });

  it("throws EmailAuthError when IMAP rejects the credentials", async () => {
    fakeServer.connectError = Object.assign(new Error("nope"), {
      authenticationFailed: true
    });
    await expect(testImapSmtp(config)).rejects.toBeInstanceOf(EmailAuthError);
  });

  it("throws EmailAuthError when SMTP rejects the credentials", async () => {
    smtpState.verifyImpl = () =>
      Promise.reject(
        Object.assign(new Error("Invalid login"), {
          code: "EAUTH",
          responseCode: 535
        })
      );
    await expect(testImapSmtp(config)).rejects.toBeInstanceOf(EmailAuthError);
  });

  it("throws AppError ERR_EMAIL_CONNECTION_FAILED when the server cannot be reached", async () => {
    fakeServer.connectError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED"
    });
    const error = await testImapSmtp(config).catch(e => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe("ERR_EMAIL_CONNECTION_FAILED");
    expect(error.statusCode).toBe(400);
  });

  it("throws AppError ERR_EMAIL_CONNECTION_FAILED when the SMTP server cannot be reached", async () => {
    smtpState.verifyImpl = () =>
      Promise.reject(
        Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" })
      );
    const error = await testImapSmtp(config).catch(e => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe("ERR_EMAIL_CONNECTION_FAILED");
  });

  it("lets a refused endpoint error through", async () => {
    resolveMock.mockRejectedValue(
      new AppError("ERR_EMAIL_HOST_NOT_ALLOWED", 400)
    );
    const error = await testImapSmtp(config).catch(e => e);
    expect(error.message).toBe("ERR_EMAIL_HOST_NOT_ALLOWED");
  });
});
