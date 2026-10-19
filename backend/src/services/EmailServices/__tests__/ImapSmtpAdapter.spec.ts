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
import {
  INITIAL_IMPORT_MAX,
  MAX_HEADERS_FETCH_BYTES,
  MAX_RAW_MESSAGE_BYTES,
  SYNC_BATCH_MAX,
  SYNC_ROUND_MAX_BYTES
} from "../limits";
import type { OutgoingEmail } from "../types";

const parserState = { fail: false };

jest.mock("mailparser", () => {
  const actual = jest.requireActual("mailparser");
  return {
    ...actual,
    simpleParser: (...args: unknown[]) =>
      parserState.fail
        ? Promise.reject(new Error("unparseable"))
        : actual.simpleParser(...args)
  };
});

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
  // size the server reports; defaults to the source length, "missing" omits it
  size?: number | "missing";
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
  calls: [] as { method: string; range: unknown; query: unknown }[],
  // runs right after a SEARCH answered, to simulate concurrent changes
  afterSearch: null as null | (() => void),
  // lets a test add unsolicited or repeated rows to a FETCH stream
  injectRows: null as null | ((rows: any[]) => any[]),
  connectError: null as Error | null,
  logouts: 0,
  reset() {
    this.folders = {};
    this.options = [];
    this.opened = [];
    this.calls = [];
    this.afterSearch = null;
    this.injectRows = null;
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
        const answer =
          !hit.length && messages.length
            ? [messages[messages.length - 1].uid]
            : hit;
        fakeServer.afterSearch?.();
        return answer;
      }
      return messages.map(m => m.uid);
    }

    private select(range: unknown) {
      const { messages } = this.folder();
      if (typeof range === "object" && range) {
        const { since } = range as { since: Date };
        const floor = dayStart(since);
        return messages.filter(m => m.internalDate.getTime() >= floor);
      }
      const wanted = new Set<number>();
      String(range)
        .split(",")
        .forEach(part => {
          const [from, to] = part.split(":").map(Number);
          for (let uid = from; uid <= (to ?? from); uid += 1) wanted.add(uid);
        });
      return messages.filter(m => wanted.has(m.uid));
    }

    async fetchAll(range: unknown, query: unknown) {
      fakeServer.calls.push({ method: "fetchAll", range, query });
      return this.select(range).map(m => ({
        uid: m.uid,
        internalDate: m.internalDate,
        size: m.size === "missing" ? undefined : (m.size ?? m.source.length),
        flags: new Set(m.flags || [])
      }));
    }

    async *fetch(
      range: string,
      query: { source?: boolean | { maxLength?: number } }
    ) {
      fakeServer.calls.push({ method: "fetch", range, query });
      const limit =
        typeof query.source === "object" ? query.source.maxLength : 0;
      const rows = this.select(range).map(m => ({
        uid: m.uid,
        internalDate: m.internalDate,
        flags: new Set(m.flags || []),
        source: limit ? m.source.subarray(0, limit) : m.source
      }));

      for (const row of fakeServer.injectRows
        ? fakeServer.injectRows(rows)
        : rows) {
        yield row;
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
  parserState.fail = false;
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
      folders: { INBOX: { uidValidity: "777", lastUid: 99 } }
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

  it("first sync fetches by search criteria and compact UID ranges, never a long id list", async () => {
    const messages: FakeMessage[] = [];
    for (let i = 1; i <= 40; i += 1) messages.push(msg(i, 1));
    fakeServer.folders.INBOX = { uidValidity: 1n, uidNext: 41, messages };

    await adapter.fetchChanges(makeAccount());

    const [meta, body] = fakeServer.calls;
    expect(meta.method).toBe("fetchAll");
    expect(meta.range).toEqual({ since: expect.any(Date) });
    expect(body).toMatchObject({ method: "fetch", range: "1:10" });
    expect(JSON.stringify(fakeServer.calls)).not.toContain("1,2,3");
  });

  it("after the first sync lastUid is max(uidNext - 1, highest imported UID)", async () => {
    // a stale uidNext below the highest imported UID must not move back
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 5,
      messages: [msg(20, 1), msg(21, 1)]
    };
    const stale = await adapter.fetchChanges(makeAccount());
    expect(stale.cursor).toEqual({
      folders: { INBOX: { uidValidity: "1", lastUid: 21 } }
    });

    // old history below uidNext - 1 is never read afterwards
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 500,
      messages: [msg(20, 1)]
    };
    const ahead = await adapter.fetchChanges(makeAccount());
    expect(ahead.cursor).toEqual({
      folders: { INBOX: { uidValidity: "1", lastUid: 499 } }
    });
  });

  it("cuts a batch by total size, keeps the cursor after the last message taken and sets hasMore", async () => {
    const MB = 1024 * 1024;
    const messages: FakeMessage[] = [];
    for (let i = 1; i <= 4; i += 1) {
      messages.push({ ...msg(i, 1), size: 30 * MB });
    }
    fakeServer.folders.INBOX = { uidValidity: 1n, uidNext: 5, messages };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const first = await adapter.fetchChanges(makeAccount(cursor));
    // 30 + 30 = 60 MB fits in 64 MB, the third would pass it
    expect(first.emails.map(e => e.providerMessageId)).toEqual([
      "INBOX:1:1",
      "INBOX:1:2"
    ]);
    expect(first.hasMore).toBe(true);
    expect(first.cursor).toEqual({
      folders: { INBOX: { uidValidity: "1", lastUid: 2 } }
    });

    const second = await adapter.fetchChanges(makeAccount(first.cursor));
    expect(second.emails.map(e => e.providerMessageId)).toEqual([
      "INBOX:1:3",
      "INBOX:1:4"
    ]);
    expect(second.hasMore).toBe(false);
  });

  it("always takes at least one message per round, whatever its size", async () => {
    const MB = 1024 * 1024;
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 3,
      messages: [
        { ...msg(1, 1), size: 50 * MB },
        { ...msg(2, 1), size: 50 * MB }
      ]
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };
    const result = await adapter.fetchChanges(makeAccount(cursor));
    expect(result.emails).toHaveLength(1);
    expect(result.hasMore).toBe(true);
  });

  it("shares the byte budget across folders and defers the next folder", async () => {
    const MB = 1024 * 1024;
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 2,
      messages: [{ ...msg(1, 1), size: 50 * MB }]
    };
    fakeServer.folders.Sent = {
      uidValidity: 2n,
      uidNext: 2,
      specialUse: "\\Sent",
      messages: [{ ...msg(1, 1), size: 20 * MB }]
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };
    const result = await adapter.fetchChanges(makeAccount(cursor));
    expect(result.emails.map(e => e.providerMessageId)).toEqual(["INBOX:1:1"]);
    expect(result.hasMore).toBe(true);
    expect((result.cursor.folders as any).Sent).toBeUndefined();
  });

  it("charges a missing or zero size as the largest downloadable message", async () => {
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    for (const size of [0, "missing"] as const) {
      fakeServer.reset();
      fakeServer.folders.INBOX = {
        uidValidity: 1n,
        uidNext: 3,
        messages: [
          { ...msg(1, 1), size },
          { ...msg(2, 1), size }
        ]
      };

      const result = await adapter.fetchChanges(makeAccount(cursor));
      // 52 MB charged for the first, the second no longer fits in 64 MB
      expect(result.emails.map(e => e.providerMessageId)).toEqual([
        "INBOX:1:1"
      ]);
      expect(result.hasMore).toBe(true);
    }
  });

  it("caps the download of every body and treats a truncated source as oversize", async () => {
    const huge = Buffer.concat([
      raw("huge", "carla@cliente.com", "Content-Type: text/plain\r\n"),
      Buffer.alloc(MAX_RAW_MESSAGE_BYTES + 1024, "a")
    ] as any);
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 3,
      messages: [
        // the server understates the size, the body is far above the cap
        { uid: 1, internalDate: hoursAgo(1), source: huge, size: 100 },
        msg(2, 1)
      ]
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    const fetches = fakeServer.calls.filter(c => c.method === "fetch");
    expect((fetches[0].query as any).source).toEqual({
      maxLength: MAX_RAW_MESSAGE_BYTES
    });
    expect(fetches[1]).toMatchObject({ range: "1" });
    expect((fetches[1].query as any).source).toEqual({
      maxLength: MAX_HEADERS_FETCH_BYTES
    });
    expect(result.emails.map(e => e.providerMessageId)).toEqual([
      "INBOX:1:1",
      "INBOX:1:2"
    ]);
    expect(result.emails[0]).toMatchObject({
      subject: "Assunto huge",
      text: "",
      attachments: []
    });
    expect(result.emails[0].flags).toContain("oversize");
    expect(result.emails[1].flags).not.toContain("oversize");
    expect(result.emails[1].text).toContain("Corpo m2");
  });

  it("bounds the IMAP literal and response sizes just above the download cap", async () => {
    fakeServer.folders.INBOX = { uidValidity: 1n, uidNext: 2, messages: [] };
    await adapter.fetchChanges(makeAccount());
    const options = fakeServer.options[0] as any;
    expect(options.maxLiteralSize).toBeGreaterThan(MAX_RAW_MESSAGE_BYTES);
    expect(options.maxLiteralSize).toBeLessThan(MAX_RAW_MESSAGE_BYTES * 1.1);
    expect(options.maxResponseSize).toBeGreaterThan(options.maxLiteralSize);
    expect(options.maxResponseSize).toBeLessThan(MAX_RAW_MESSAGE_BYTES * 1.2);
  });

  it("charges headers-only messages a small weight so they do not eat the round budget", async () => {
    const MB = 1024 * 1024;
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 5,
      messages: [1, 2, 3, 4].map(uid => ({ ...msg(uid, 1), size: 80 * MB }))
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };
    const result = await adapter.fetchChanges(makeAccount(cursor));
    expect(result.emails).toHaveLength(4);
    expect(result.hasMore).toBe(false);
  });

  it("does not ask for another round when every candidate was expunged before the fetch", async () => {
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 3,
      messages: [msg(1, 1), msg(2, 1)]
    };
    fakeServer.afterSearch = () => {
      fakeServer.folders.INBOX.messages = [];
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };
    const result = await adapter.fetchChanges(makeAccount(cursor));
    expect(result.emails).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toEqual({
      folders: { INBOX: { uidValidity: "1", lastUid: 2 } }
    });
  });

  it("charges the bytes really downloaded when the reported sizes are understated", async () => {
    const body = Buffer.concat([
      raw("big", "carla@cliente.com", "Content-Type: text/plain\r\n"),
      Buffer.alloc(20 * 1024 * 1024, "a")
    ] as any);
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 6,
      messages: [1, 2, 3, 4, 5].map(uid => ({
        uid,
        internalDate: hoursAgo(1),
        source: body,
        size: 100
      }))
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const first = await adapter.fetchChanges(makeAccount(cursor));

    // 3 x 20 MB fit in the 64 MB round, the 4th is discarded and read again
    expect(first.emails.map(e => e.providerMessageId)).toEqual([
      "INBOX:1:1",
      "INBOX:1:2",
      "INBOX:1:3"
    ]);
    expect(first.hasMore).toBe(true);
    expect(first.cursor).toEqual({
      folders: { INBOX: { uidValidity: "1", lastUid: 3 } }
    });

    const second = await adapter.fetchChanges(makeAccount(first.cursor));
    expect(second.emails.map(e => e.providerMessageId)).toEqual([
      "INBOX:1:4",
      "INBOX:1:5"
    ]);
    expect(second.hasMore).toBe(false);
  }, 60000);

  it("fetches in small UID batches", async () => {
    const messages: FakeMessage[] = [];
    for (let i = 1; i <= 25; i += 1) messages.push(msg(i, 1));
    fakeServer.folders.INBOX = { uidValidity: 1n, uidNext: 26, messages };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };
    const result = await adapter.fetchChanges(makeAccount(cursor));
    expect(result.emails).toHaveLength(25);
    expect(
      fakeServer.calls.filter(c => c.method === "fetch").map(c => c.range)
    ).toEqual(["1:10", "11:20", "21:25"]);
  });

  it("ignores unsolicited and repeated FETCH rows", async () => {
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 4,
      messages: [
        msg(1, 1),
        msg(2, 1),
        {
          uid: 3,
          internalDate: hoursAgo(1),
          source: raw(
            "big",
            "carla@cliente.com",
            "Content-Type: text/plain\r\n"
          ),
          size: 80 * 1024 * 1024
        }
      ]
    };
    fakeServer.injectRows = rows => [
      rows[0],
      rows[0],
      { ...rows[0], uid: 99 },
      ...rows.slice(1),
      rows[rows.length - 1]
    ];
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    expect(result.emails.map(e => e.providerMessageId)).toEqual([
      "INBOX:1:1",
      "INBOX:1:2",
      "INBOX:1:3"
    ]);
    expect(result.cursor).toEqual({
      folders: { INBOX: { uidValidity: "1", lastUid: 3 } }
    });
  });

  it("reads only a bounded prefix for headers-only messages, however long the headers", async () => {
    const padding = Array.from(
      { length: 4000 },
      (_, i) => `X-Pad-${i}: ${"a".repeat(40)}\r\n`
    ).join("");
    const lying = Buffer.from(
      `From: Carla <carla@cliente.com>\r\nTo: loja@empresa.com\r\n` +
        `Subject: Cabecalho longo\r\nMessage-ID: <long@cliente.com>\r\n${padding}\r\ncorpo`
    );
    expect(lying.length).toBeGreaterThan(MAX_HEADERS_FETCH_BYTES);
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 2,
      messages: [
        {
          uid: 1,
          internalDate: hoursAgo(1),
          source: lying,
          size: 80 * 1024 * 1024
        }
      ]
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    expect(fakeServer.calls.filter(c => c.method === "fetch")).toHaveLength(1);
    expect(
      (fakeServer.calls.find(c => c.method === "fetch")!.query as any).source
    ).toEqual({ maxLength: MAX_HEADERS_FETCH_BYTES });
    expect(result.emails[0]).toMatchObject({
      subject: "Cabecalho longo",
      internetMessageId: "<long@cliente.com>",
      text: ""
    });
    expect(result.emails[0].flags).toContain("oversize");
  });

  it("does not let a FLAGS-only row hide the real row of an oversize message", async () => {
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 2,
      messages: [
        {
          uid: 1,
          internalDate: hoursAgo(1),
          source: raw(
            "big",
            "carla@cliente.com",
            "Content-Type: text/plain\r\n"
          ),
          size: 80 * 1024 * 1024
        }
      ]
    };
    fakeServer.injectRows = rows => [
      { ...rows[0], source: undefined },
      ...rows
    ];
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    expect(result.emails.map(e => e.providerMessageId)).toEqual(["INBOX:1:1"]);
    expect(result.emails[0].flags).toContain("oversize");
    expect(result.emails[0].subject).toBe("Assunto big");
  });

  it("does not stop for an exactly full budget (no needless extra round)", async () => {
    const budget = SYNC_ROUND_MAX_BYTES;
    const pad = (id: string, length: number) => {
      const base = raw(id);
      return Buffer.concat([
        base,
        Buffer.alloc(length - base.length, "a")
      ] as any);
    };
    const last = raw("m11");
    // 10 messages claiming 100 bytes whose real sizes use exactly what is left
    // for them once the honest 11th message has been reserved
    const total = budget - last.length;
    const each = Math.floor(total / 10);
    const sizes = Array.from({ length: 10 }, (_, i) =>
      i === 9 ? total - each * 9 : each
    );
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 12,
      messages: [
        ...sizes.map((length, i) => ({
          uid: i + 1,
          internalDate: hoursAgo(1),
          source: pad(`m${i + 1}`, length),
          size: 100
        })),
        { uid: 11, internalDate: hoursAgo(1), source: last }
      ]
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    expect(result.emails).toHaveLength(11);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toEqual({
      folders: { INBOX: { uidValidity: "1", lastUid: 11 } }
    });
  }, 60000);

  it("counts a run of truncated messages against the budget instead of downloading all of them", async () => {
    const huge = Buffer.concat([
      raw("huge", "carla@cliente.com", "Content-Type: text/plain\r\n"),
      Buffer.alloc(MAX_RAW_MESSAGE_BYTES + 1024, "a")
    ] as any);
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 4,
      messages: [1, 2, 3].map(uid => ({
        uid,
        internalDate: hoursAgo(1),
        source: huge,
        size: 100
      }))
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    // the first one is always taken (52 MB of the 64 MB round); the second
    // would pass the budget, so the run stops there
    expect(result.emails.map(e => e.providerMessageId)).toEqual(["INBOX:1:1"]);
    expect(result.emails[0].flags).toContain("oversize");
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toEqual({
      folders: { INBOX: { uidValidity: "1", lastUid: 1 } }
    });
  }, 60000);

  it("counts a run of unparseable messages against the budget too", async () => {
    parserState.fail = true;
    const body = Buffer.concat([
      raw("big", "carla@cliente.com", "Content-Type: text/plain\r\n"),
      Buffer.alloc(30 * 1024 * 1024, "a")
    ] as any);
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 4,
      messages: [1, 2, 3].map(uid => ({
        uid,
        internalDate: hoursAgo(1),
        source: body,
        size: 100
      }))
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    // 30 + 30 MB fit in 64 MB; the third is not downloaded into this round
    expect(result.emails).toHaveLength(0);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toEqual({
      folders: { INBOX: { uidValidity: "1", lastUid: 2 } }
    });
  }, 60000);

  it("imports an oversize message as headers only, flagged oversize", async () => {
    const MB = 1024 * 1024;
    const big = raw("big", "carla@cliente.com", "Content-Type: text/plain\r\n");
    fakeServer.folders.INBOX = {
      uidValidity: 1n,
      uidNext: 4,
      messages: [
        msg(1, 1),
        {
          uid: 2,
          internalDate: hoursAgo(1),
          flags: ["\\Seen"],
          source: big,
          size: 80 * MB
        },
        msg(3, 1)
      ]
    };
    const cursor = { folders: { INBOX: { uidValidity: "1", lastUid: 0 } } };

    const result = await adapter.fetchChanges(makeAccount(cursor));

    expect(result.emails.map(e => e.providerMessageId)).toEqual([
      "INBOX:1:1",
      "INBOX:1:2",
      "INBOX:1:3"
    ]);
    const oversize = result.emails[1];
    expect(oversize).toMatchObject({
      subject: "Assunto big",
      from: { address: "carla@cliente.com" },
      internetMessageId: "<big@cliente.com>",
      text: "",
      attachments: []
    });
    expect(oversize.htmlSanitized).toBeUndefined();
    expect(oversize.flags).toEqual(
      expect.arrayContaining(["\\Seen", "oversize"])
    );
    expect(result.emails[0].flags).not.toContain("oversize");
    // the full body of the big message is never requested
    const bodyFetches = fakeServer.calls.filter(
      c =>
        c.method === "fetch" &&
        (c.query as any).source?.maxLength === MAX_RAW_MESSAGE_BYTES
    );
    expect(bodyFetches.map(c => c.range)).toEqual(["1,3"]);
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

  it("verifies the server certificate and sends SNI only for DNS names (IMAP)", async () => {
    fakeServer.folders.INBOX = { uidValidity: 1n, uidNext: 2, messages: [] };
    await adapter.fetchChanges(makeAccount());
    const [options] = fakeServer.options as any[];
    expect(options.tls.rejectUnauthorized).not.toBe(false);

    resolveMock.mockImplementation(async ({ port }) => ({
      address: "203.0.113.10",
      servername: "203.0.113.10",
      port
    }));
    await adapter.fetchChanges(makeAccount());
    const second = fakeServer.options[1] as any;
    expect("servername" in second).toBe(false);
    expect("servername" in second.tls).toBe(false);
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
    expect(error.code).toBe("ERR_EMAIL_INVALID_MESSAGE");
    expect(error.reason).toBe("attachment_missing");
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
    expect(error.code).toBe("ERR_EMAIL_REJECTED");
    expect(error.reason).toBe("550");
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
    expect(error.code).toBe("ERR_EMAIL_REJECTED");
    expect(error.reason).toBe("554");
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

  it("returns only the count of recipients the server refused when the rest were accepted", async () => {
    smtpState.sendImpl = mail =>
      Promise.resolve({
        messageId: mail.messageId,
        accepted: ["a@b.com"],
        rejected: ["x@y.com", "z@w.com"]
      });
    const result = await adapter.send(makeAccount(), outgoing());
    expect(result).toEqual({ rejectedCount: 2 });
    expect(JSON.stringify(result)).not.toContain("@");
  });

  it("maps local validation failures to ERR_EMAIL_INVALID_MESSAGE", async () => {
    smtpState.sendImpl = () =>
      Promise.reject(
        Object.assign(new Error('Invalid recipient "x"'), {
          code: "EENVELOPE",
          command: "API"
        })
      );
    const error = await adapter.send(makeAccount(), outgoing()).catch(e => e);
    expect(error).toBeInstanceOf(EmailSendRejectedError);
    expect(error.code).toBe("ERR_EMAIL_INVALID_MESSAGE");
    expect(error.reason).toBe("EENVELOPE");
  });

  it("logs unrecognised errors without secrets: name and code only, stack only for programming errors", async () => {
    const warn = logger.warn as jest.Mock;

    smtpState.sendImpl = () =>
      Promise.reject(
        Object.assign(new Error("boom s3cret-pass"), { name: "WeirdLibError" })
      );
    await adapter.send(makeAccount(), outgoing()).catch(e => e);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({
      accountId: 5,
      name: "WeirdLibError",
      code: undefined
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("s3cret-pass");

    warn.mockClear();
    smtpState.sendImpl = () => Promise.reject(new TypeError("x is undefined"));
    await adapter.send(makeAccount(), outgoing()).catch(e => e);
    expect(warn.mock.calls[0][0]).toMatchObject({
      accountId: 5,
      name: "TypeError",
      stack: expect.stringContaining("TypeError")
    });

    warn.mockClear();
    fakeServer.connectError = Object.assign(new Error("weird s3cret-pass"), {
      name: "ImapFlowError"
    });
    await adapter.fetchChanges(makeAccount()).catch(e => e);
    expect(warn.mock.calls[0][0]).toEqual({
      accountId: 5,
      name: "ImapFlowError",
      code: undefined
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("s3cret-pass");
  });

  it("does not log recognised network failures", async () => {
    smtpState.sendImpl = () =>
      Promise.reject(Object.assign(new Error("x"), { code: "ECONNREFUSED" }));
    await adapter.send(makeAccount(), outgoing()).catch(e => e);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("verifies the server certificate and sends SNI only for DNS names", async () => {
    await adapter.send(makeAccount(), outgoing());
    const { tls } = smtpState.transports[0].options;
    expect(tls.rejectUnauthorized).not.toBe(false);
    expect(tls.servername).toBe("smtp.empresa.com");

    resolveMock.mockImplementation(async ({ port }) => ({
      address: "203.0.113.10",
      servername: "203.0.113.10",
      port
    }));
    await adapter.send(makeAccount(), outgoing());
    expect("servername" in smtpState.transports[1].options.tls).toBe(false);
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

  it("never disables certificate verification for IMAP or SMTP", async () => {
    await testImapSmtp(config);
    expect((fakeServer.options[0] as any).tls.rejectUnauthorized).not.toBe(
      false
    );
    expect(smtpState.transports[0].options.tls.rejectUnauthorized).not.toBe(
      false
    );
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
