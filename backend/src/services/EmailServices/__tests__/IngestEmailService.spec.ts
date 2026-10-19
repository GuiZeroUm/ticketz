/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import os from "os";
import path from "path";
import { Op, UniqueConstraintError } from "sequelize";
import sequelize from "../../../database";
import AppError from "../../../errors/AppError";
import Contact from "../../../models/Contact";
import ContactIdentity from "../../../models/ContactIdentity";
import EmailAttachment from "../../../models/EmailAttachment";
import EmailMessage from "../../../models/EmailMessage";
import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import { getIO } from "../../../libs/socket";
import { checkCompanyCompliant } from "../../../helpers/CheckCompanyCompliant";
import { logger } from "../../../utils/logger";
import { websocketCreateMessage } from "../../MessageServices/CreateMessageService";
import { websocketUpdateTicket } from "../../TicketServices/UpdateTicketService";
import FindOrCreateATicketTrakingService from "../../TicketServices/FindOrCreateATicketTrakingService";
import { incrementCounter } from "../../CounterServices/IncrementCounter";
import FindOrCreateEmailContactService from "../FindOrCreateEmailContactService";
import { MAX_ATTACHMENT_BYTES } from "../limits";
import { NormalizedAttachment, NormalizedEmail } from "../types";

const mockPrivateDir = fs.mkdtempSync(path.join(os.tmpdir(), "email-ingest-"));

jest.mock("../../../config/privateFiles", () => ({
  __esModule: true,
  default: { directory: mockPrivateDir }
}));
jest.mock("../../../database", () => ({
  __esModule: true,
  default: { transaction: jest.fn(), query: jest.fn() }
}));
jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() }
}));
jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() }
}));
jest.mock("../../../models/EmailMessage", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() }
}));
jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/EmailAttachment", () => ({
  __esModule: true,
  default: { create: jest.fn() }
}));
jest.mock("../../../models/ContactIdentity", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../FindOrCreateEmailContactService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../TicketServices/FindOrCreateATicketTrakingService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../CounterServices/IncrementCounter", () => ({
  incrementCounter: jest.fn()
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
jest.mock("../../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../../helpers/CheckCompanyCompliant", () => ({
  checkCompanyCompliant: jest.fn()
}));
jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import IngestEmailService from "../IngestEmailService";

import FindOrCreateEmailTicketService from "../FindOrCreateEmailTicketService";

/* ------------------------------------------------------------------------ */
/* In-memory stand-in for the tables touched by the ingestion.              */
/* Mutations made with { transaction } are undone when that transaction     */
/* rolls back, so tests can check what really survives a failure.           */
/* ------------------------------------------------------------------------ */

type Row = Record<string, any>;
type FakeTx = {
  undo: (() => void)[];
  hooks: ((tx: FakeTx) => unknown)[];
  afterCommit: (fn: (tx: FakeTx) => unknown) => void;
};

let tables: Record<
  "Ticket" | "EmailMessage" | "Message" | "EmailAttachment",
  Row[]
>;
let nextId: number;
let events: string[];

const DAY = 24 * 60 * 60 * 1000;

const journal = (
  opts: { transaction?: FakeTx } | undefined,
  undo: () => void
) => {
  if (opts?.transaction) opts.transaction.undo.push(undo);
};

const matches = (where: Row = {}, row: Row): boolean => {
  if (Object.getOwnPropertySymbols(where).length) {
    throw new Error("unsupported top-level operator in fake where");
  }
  return Object.keys(where).every(key => {
    const cond = where[key];
    const value = row[key] ?? null;
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      return Object.getOwnPropertySymbols(cond).every(op => {
        const arg = cond[op as any];
        if (op === Op.in) return (arg as unknown[]).includes(value);
        if (op === Op.ne) return value !== arg;
        if (op === Op.gte) return value !== null && value >= arg;
        if (op === Op.lt) return value !== null && value < arg;
        throw new Error(`unsupported operator ${String(op)}`);
      });
    }
    return value === (cond ?? null);
  });
};

const sortRows = (rows: Row[], order?: [string, string][]): Row[] => {
  if (!order?.length) return rows;
  const [[field, dir]] = order;
  const sign = dir.toUpperCase() === "DESC" ? -1 : 1;
  return [...rows].sort((a, b) =>
    a[field] > b[field] ? sign : a[field] < b[field] ? -sign : 0
  );
};

const uniqueProviderError = () =>
  new UniqueConstraintError({
    message: "Validation error",
    errors: [],
    fields: { companyId: 1, emailAccountId: 5, providerMessageId: "x" },
    parent: Object.assign(new Error("duplicate key"), {
      constraint: "email_messages_provider_unique"
    }) as any
  });

const assertProviderUnique = (row: Row) => {
  if (!row.providerMessageId) return;
  const clash = tables.EmailMessage.find(
    other =>
      other !== row &&
      other.companyId === row.companyId &&
      other.emailAccountId === row.emailAccountId &&
      other.providerMessageId === row.providerMessageId
  );
  if (clash) throw uniqueProviderError();
};

const makeRow = (table: keyof typeof tables, values: Row): Row => {
  const row: Row = { ...values };
  const touch =
    table === "Ticket" ? () => ({ updatedAt: new Date() }) : () => ({});
  row.update = async (vals: Row, opts?: { transaction?: FakeTx }) => {
    const keys = [...Object.keys(vals), "updatedAt"];
    const old = Object.fromEntries(keys.map(k => [k, row[k]]));
    Object.assign(row, vals, touch());
    if (table === "EmailMessage") {
      try {
        assertProviderUnique(row);
      } catch (e) {
        Object.assign(row, old);
        throw e;
      }
    }
    journal(opts, () => Object.assign(row, old));
    return row;
  };
  row.increment = async (field: string, opts?: { transaction?: FakeTx }) => {
    const old = { [field]: row[field], updatedAt: row.updatedAt };
    row[field] = (row[field] || 0) + 1;
    Object.assign(row, touch());
    journal(opts, () => Object.assign(row, old));
    return row;
  };
  row.set = (vals: Row) => {
    row.pending = { ...(row.pending || {}), ...vals };
  };
  row.changed = jest.fn();
  row.save = async (opts?: { transaction?: FakeTx }) => {
    const vals = row.pending || {};
    delete row.pending;
    return row.update(vals, opts);
  };
  row.reload = async () => row;
  return row;
};

const insert = (
  table: keyof typeof tables,
  values: Row,
  opts?: { transaction?: FakeTx }
) => {
  const row = makeRow(table, {
    ...(table === "Message" ? {} : { id: nextId++ }),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...values
  });
  if (table === "EmailMessage") assertProviderUnique(row);
  tables[table].push(row);
  journal(opts, () => {
    tables[table] = tables[table].filter(r => r !== row);
  });
  return row;
};

const findOne =
  (table: keyof typeof tables) =>
  async (opts: Row = {}) => {
    const found = sortRows(
      tables[table].filter(r => matches(opts.where, r)),
      opts.order
    )[0];
    if (!found) return null;
    if (table === "Message" && opts.include) {
      found.ticket = tables.Ticket.find(t => t.id === found.ticketId);
    }
    return found;
  };

const findAll =
  (table: keyof typeof tables) =>
  async (opts: Row = {}) =>
    sortRows(
      tables[table].filter(r => matches(opts.where, r)),
      opts.order
    ).slice(0, opts.limit ?? Infinity);

const create =
  (table: keyof typeof tables) => async (values: Row, opts?: Row) =>
    insert(table, values, opts as any);

/* ------------------------------------------------------------------------ */

const transactionMock = sequelize.transaction as unknown as jest.Mock;
const queryMock = sequelize.query as unknown as jest.Mock;
const findContact = FindOrCreateEmailContactService as jest.Mock;
const tracking = FindOrCreateATicketTrakingService as jest.Mock;
const emitMessage = websocketCreateMessage as jest.Mock;
const emitTicket = websocketUpdateTicket as jest.Mock;
const counter = incrementCounter as jest.Mock;
const identityFindOne = ContactIdentity.findOne as jest.Mock;

const account = {
  id: 5,
  companyId: 1,
  queueId: 3,
  address: "suporte@empresa.com"
} as any;

const mail = (overrides: Partial<NormalizedEmail> = {}): NormalizedEmail => ({
  accountId: 5,
  direction: "in",
  providerMessageId: "INBOX:1:1",
  internetMessageId: "<a1@cliente.com>",
  references: [],
  from: { address: "ana@cliente.com", name: "Ana" },
  replyTo: [],
  to: [{ address: "suporte@empresa.com" }],
  cc: [],
  subject: "Pedido 123",
  text: "Olá, tudo bem?",
  attachments: [],
  receivedAt: new Date("2026-10-18T10:00:00Z"),
  flags: [],
  ...overrides
});

const outbound = (overrides: Partial<NormalizedEmail> = {}) =>
  mail({
    direction: "out",
    providerMessageId: "Sent:1:1",
    internetMessageId: "<o1@empresa.com>",
    from: { address: "suporte@empresa.com" },
    to: [{ address: "ana@cliente.com", name: "Ana" }],
    subject: "Re: Pedido 123",
    text: "Resposta enviada pelo Gmail",
    ...overrides
  });

const attachment = (
  overrides: Partial<NormalizedAttachment> = {}
): NormalizedAttachment => {
  const content = overrides.content || Buffer.from("conteudo");
  return {
    filename: "nota.pdf",
    contentType: "application/pdf",
    size: content.length,
    content,
    inline: false,
    ...overrides
  };
};

const seedTicket = (values: Row) =>
  insert("Ticket", {
    companyId: 1,
    channel: "email",
    emailAccountId: 5,
    contactId: 42,
    status: "pending",
    unreadMessages: 0,
    queueId: 3,
    whatsappId: null,
    ...values
  });

const filesUnder = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap(entry =>
          entry.isDirectory()
            ? filesUnder(path.join(dir, entry.name))
            : [entry.name]
        )
    : [];

const ticketsOf = (where: Row = {}) =>
  tables.Ticket.filter(t => matches(where, t));

describe("IngestEmailService", () => {
  beforeEach(() => {
    tables = { Ticket: [], EmailMessage: [], Message: [], EmailAttachment: [] };
    nextId = 100;
    events = [];
    fs.rmSync(path.join(mockPrivateDir, "email"), {
      recursive: true,
      force: true
    });

    transactionMock.mockImplementation(async (cb: (tx: FakeTx) => unknown) => {
      const tx: FakeTx = {
        undo: [],
        hooks: [],
        afterCommit(fn) {
          this.hooks.push(fn);
        }
      };
      try {
        const result = await cb(tx);
        events.push("commit");
        // eslint-disable-next-line no-restricted-syntax
        for (const hook of tx.hooks) await hook(tx);
        return result;
      } catch (e) {
        tx.undo.reverse().forEach(undo => undo());
        events.push("rollback");
        throw e;
      }
    });
    queryMock.mockResolvedValue([]);

    (Ticket.findOne as jest.Mock).mockImplementation(findOne("Ticket"));
    (Ticket.findAll as jest.Mock).mockImplementation(findAll("Ticket"));
    (Ticket.create as jest.Mock).mockImplementation(create("Ticket"));
    (Message.findOne as jest.Mock).mockImplementation(findOne("Message"));
    (Message.create as jest.Mock).mockImplementation(create("Message"));
    (EmailMessage.findOne as jest.Mock).mockImplementation(
      findOne("EmailMessage")
    );
    (EmailMessage.create as jest.Mock).mockImplementation(
      create("EmailMessage")
    );
    (EmailAttachment.create as jest.Mock).mockImplementation(
      create("EmailAttachment")
    );
    (EmailMessage.findAll as jest.Mock).mockImplementation(
      findAll("EmailMessage")
    );
    (Contact.findOne as jest.Mock).mockResolvedValue(null);
    identityFindOne.mockResolvedValue(null);

    findContact.mockResolvedValue({ id: 42, name: "Ana" });
    tracking.mockResolvedValue({});
    counter.mockResolvedValue(undefined);
    (checkCompanyCompliant as jest.Mock).mockResolvedValue(true);
    emitMessage.mockImplementation(async () => {
      events.push("emit:appMessage:create");
    });
    emitTicket.mockImplementation(() => {
      events.push("emit:ticket:update");
    });
    const room = {
      to: jest.fn(() => room),
      emit: jest.fn((event: string, payload: Row) => {
        events.push(`emit:${event}:${payload.action}`);
      })
    };
    (getIO as jest.Mock).mockReturnValue(room);
  });

  afterAll(() => {
    fs.rmSync(mockPrivateDir, { recursive: true, force: true });
  });

  it("creates contact, pending ticket with subject/queue from account and an email Message", async () => {
    const result = await IngestEmailService(account, mail());

    expect(findContact).toHaveBeenCalledWith({
      companyId: 1,
      address: "ana@cliente.com",
      name: "Ana",
      emailAccountId: 5
    });

    expect(tables.Ticket).toHaveLength(1);
    const [ticket] = tables.Ticket;
    expect(ticket).toMatchObject({
      companyId: 1,
      contactId: 42,
      channel: "email",
      status: "pending",
      queueId: 3,
      emailAccountId: 5,
      emailThreadKey: "m:<a1@cliente.com>",
      subject: "Pedido 123",
      unreadMessages: 1,
      lastMessage: "Pedido 123",
      isGroup: false
    });

    expect(tables.Message).toHaveLength(1);
    const [message] = tables.Message;
    expect(message).toMatchObject({
      ticketId: ticket.id,
      companyId: 1,
      contactId: 42,
      channel: "email",
      body: "Olá, tudo bem?",
      fromMe: false,
      read: false,
      ack: 0,
      queueId: 3,
      createdAt: new Date("2026-10-18T10:00:00Z")
    });
    expect(message.id).toMatch(/^[0-9a-f-]{36}$/);

    expect(tables.EmailMessage).toHaveLength(1);
    expect(tables.EmailMessage[0]).toMatchObject({
      companyId: 1,
      emailAccountId: 5,
      ticketId: ticket.id,
      messageId: message.id,
      direction: "in",
      providerMessageId: "INBOX:1:1",
      internetMessageId: "<a1@cliente.com>",
      subject: "Pedido 123",
      fromAddress: { address: "ana@cliente.com", name: "Ana" },
      toAddresses: [{ address: "suporte@empresa.com" }],
      replyToAddresses: [],
      sendStatus: null
    });

    expect(result).toEqual({
      status: "created",
      ticketId: ticket.id,
      messageId: message.id
    });
    expect(tracking).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: ticket.id,
        companyId: 1,
        transaction: expect.anything()
      })
    );
    expect(counter).toHaveBeenCalledWith(1, "ticket-create");
  });

  it("stores the Reply-To addresses of an inbound email", async () => {
    await IngestEmailService(
      account,
      mail({ replyTo: [{ address: "vendas@cliente.com", name: "Vendas" }] })
    );
    expect(tables.EmailMessage[0].replyToAddresses).toEqual([
      { address: "vendas@cliente.com", name: "Vendas" }
    ]);
  });

  it("ingests the same providerMessageId once", async () => {
    const first = await IngestEmailService(account, mail());
    const second = await IngestEmailService(account, mail());

    expect(first.status).toBe("created");
    expect(second).toEqual({
      status: "duplicate",
      ticketId: first.ticketId,
      messageId: first.messageId
    });
    expect(tables.Message).toHaveLength(1);
    expect(tables.EmailMessage).toHaveLength(1);
    expect(tables.Ticket[0].unreadMessages).toBe(1);
    expect((EmailMessage.findOne as jest.Mock).mock.calls[0][0].where).toEqual({
      companyId: 1,
      emailAccountId: 5,
      providerMessageId: "INBOX:1:1"
    });
  });

  it("returns duplicate when another process wins the unique index, rolling back the new ticket and files", async () => {
    // committed by "another process" after our pre-check ran
    const winner = insert("EmailMessage", {
      companyId: 1,
      emailAccountId: 5,
      ticketId: 900,
      messageId: "other-process",
      direction: "in",
      providerMessageId: "INBOX:1:1"
    });
    (EmailMessage.findOne as jest.Mock).mockImplementationOnce(
      async () => null
    );

    const result = await IngestEmailService(
      account,
      mail({ attachments: [attachment()] })
    );

    expect(result).toEqual({
      status: "duplicate",
      ticketId: 900,
      messageId: "other-process"
    });
    expect(tables.Ticket).toHaveLength(0);
    expect(tables.Message).toHaveLength(0);
    expect(tables.EmailMessage).toEqual([winner]);
    expect(tables.EmailAttachment).toHaveLength(0);
    expect(filesUnder(mockPrivateDir)).toEqual([]);
    expect(events).toEqual(["rollback"]);
    expect(counter).not.toHaveBeenCalled();
  });

  it("does not treat other unique violations as duplicates", async () => {
    (Message.create as jest.Mock).mockRejectedValueOnce(
      new UniqueConstraintError({
        message: "Validation error",
        errors: [],
        fields: { id: "x", ticketId: 1 },
        parent: Object.assign(new Error("dup"), {
          constraint: "Messages_pkey"
        }) as any
      })
    );

    await expect(IngestEmailService(account, mail())).rejects.toBeInstanceOf(
      UniqueConstraintError
    );
    expect(tables.Ticket).toHaveLength(0);
    expect(tables.EmailMessage).toHaveLength(0);
  });

  it("threads by Gmail providerThreadId", async () => {
    const first = await IngestEmailService(
      account,
      mail({ providerMessageId: "g1", providerThreadId: "t-1" })
    );
    const second = await IngestEmailService(
      account,
      mail({
        providerMessageId: "g2",
        providerThreadId: "t-1",
        internetMessageId: "<a2@cliente.com>",
        subject: "assunto completamente diferente"
      })
    );
    const other = await IngestEmailService(
      account,
      mail({
        providerMessageId: "g3",
        providerThreadId: "t-2",
        internetMessageId: "<a3@cliente.com>"
      })
    );

    expect(second.ticketId).toBe(first.ticketId);
    expect(other.ticketId).not.toBe(first.ticketId);
    expect(tables.Ticket.map(t => t.emailThreadKey)).toEqual([
      "g:t-1",
      "g:t-2"
    ]);
    expect(tables.Ticket[0].unreadMessages).toBe(2);
    expect(tables.Ticket[0].subject).toBe("Pedido 123");
  });

  it("threads a reply by In-Reply-To/References", async () => {
    const first = await IngestEmailService(account, mail());

    const byInReplyTo = await IngestEmailService(
      account,
      mail({
        providerMessageId: "INBOX:1:2",
        internetMessageId: "<a2@cliente.com>",
        inReplyTo: "<a1@cliente.com>",
        subject: "outro assunto"
      })
    );
    const byReferences = await IngestEmailService(
      account,
      mail({
        providerMessageId: "INBOX:1:3",
        internetMessageId: "<a3@cliente.com>",
        inReplyTo: "<desconhecido@x.com>",
        references: ["<antigo@x.com>", "<a2@cliente.com>"],
        subject: "mais um"
      })
    );

    // reply to a message sent from the system (outbound EmailMessage)
    const sentTicket = seedTicket({
      emailThreadKey: "m:<s1@empresa.com>",
      subject: "Orçamento"
    });
    insert("EmailMessage", {
      companyId: 1,
      emailAccountId: 5,
      ticketId: sentTicket.id,
      messageId: "sent-1",
      direction: "out",
      internetMessageId: "<s1@empresa.com>",
      sendStatus: "sent"
    });
    const toSent = await IngestEmailService(
      account,
      mail({
        providerMessageId: "INBOX:1:4",
        internetMessageId: "<a4@cliente.com>",
        inReplyTo: "<s1@empresa.com>",
        subject: "Re: Orçamento"
      })
    );

    expect(byInReplyTo.ticketId).toBe(first.ticketId);
    expect(byReferences.ticketId).toBe(first.ticketId);
    expect(toSent.ticketId).toBe(sentTicket.id);
    expect(tables.Ticket).toHaveLength(2);
  });

  it("does not match a parent message of another email account", async () => {
    const foreign = seedTicket({
      emailAccountId: 6,
      emailThreadKey: "m:<f1@x.com>"
    });
    insert("EmailMessage", {
      companyId: 1,
      emailAccountId: 6,
      ticketId: foreign.id,
      messageId: "f-1",
      direction: "in",
      internetMessageId: "<f1@x.com>"
    });

    const result = await IngestEmailService(
      account,
      mail({ inReplyTo: "<f1@x.com>", internetMessageId: "<a9@cliente.com>" })
    );

    expect(result.ticketId).not.toBe(foreign.id);
    expect(ticketsOf({ emailAccountId: 5 })[0].emailThreadKey).toBe(
      "m:<a9@cliente.com>"
    );
  });

  it("falls back to subject+counterpart only within 30 days and for open tickets", async () => {
    const reply = (n: number) =>
      mail({
        providerMessageId: `INBOX:1:${n}`,
        internetMessageId: `<r${n}@cliente.com>`,
        subject: "RE: Pedido   123"
      });

    // (a) open ticket, same contact, same normalized subject, 10 days old → reused
    const recent = seedTicket({
      emailThreadKey: "m:<old@cliente.com>",
      subject: "Pedido 123",
      status: "open",
      updatedAt: new Date(Date.now() - 10 * DAY)
    });
    const a = await IngestEmailService(account, reply(1));
    expect(a.ticketId).toBe(recent.id);

    // (b) same but 31 days old → new ticket
    tables.Ticket = [];
    const stale = seedTicket({
      emailThreadKey: "m:<old@cliente.com>",
      subject: "Pedido 123",
      updatedAt: new Date(Date.now() - 31 * DAY)
    });
    const b = await IngestEmailService(account, reply(2));
    expect(b.ticketId).not.toBe(stale.id);

    // (c) closed ticket within 30 days → new ticket, the closed one stays closed
    tables.Ticket = [];
    const closed = seedTicket({
      emailThreadKey: "m:<old@cliente.com>",
      subject: "Pedido 123",
      status: "closed",
      updatedAt: new Date(Date.now() - 2 * DAY)
    });
    const c = await IngestEmailService(account, reply(3));
    expect(c.ticketId).not.toBe(closed.id);
    expect(closed.status).toBe("closed");

    // (d) another counterpart with the same subject → new ticket
    tables.Ticket = [];
    const otherContact = seedTicket({
      contactId: 77,
      emailThreadKey: "m:<old@cliente.com>",
      subject: "Pedido 123",
      updatedAt: new Date(Date.now() - DAY)
    });
    const d = await IngestEmailService(account, reply(4));
    expect(d.ticketId).not.toBe(otherContact.id);

    // (e) another email account of the company → new ticket
    tables.Ticket = [];
    const otherAccount = seedTicket({
      emailAccountId: 6,
      emailThreadKey: "m:<old@cliente.com>",
      subject: "Pedido 123",
      updatedAt: new Date(Date.now() - DAY)
    });
    const e = await IngestEmailService(account, reply(5));
    expect(e.ticketId).not.toBe(otherAccount.id);
  });

  it("does not use the subject fallback for Gmail threads or empty subjects", async () => {
    const open = seedTicket({
      emailThreadKey: "m:<old@cliente.com>",
      subject: "",
      status: "open"
    });
    const emptySubject = await IngestEmailService(
      account,
      mail({
        subject: "Re:",
        internetMessageId: "<e1@cliente.com>",
        providerMessageId: "e1"
      })
    );
    expect(emptySubject.ticketId).not.toBe(open.id);

    const named = seedTicket({
      emailThreadKey: "m:<old2@cliente.com>",
      subject: "Pedido 123",
      status: "open"
    });
    const gmail = await IngestEmailService(
      account,
      mail({
        providerThreadId: "t-9",
        providerMessageId: "g9",
        internetMessageId: "<g9@cliente.com>"
      })
    );
    expect(gmail.ticketId).not.toBe(named.id);
  });

  it("reopens a closed ticket as pending on inbound reply", async () => {
    const closed = seedTicket({
      emailThreadKey: "m:<a1@cliente.com>",
      status: "closed",
      userId: 9,
      unreadMessages: 0,
      queueId: null
    });
    insert("EmailMessage", {
      companyId: 1,
      emailAccountId: 5,
      ticketId: closed.id,
      messageId: "first",
      direction: "in",
      providerMessageId: "INBOX:1:1",
      internetMessageId: "<a1@cliente.com>"
    });

    const result = await IngestEmailService(
      account,
      mail({
        providerMessageId: "INBOX:1:2",
        internetMessageId: "<a2@cliente.com>",
        inReplyTo: "<a1@cliente.com>"
      })
    );

    expect(result).toMatchObject({ status: "created", ticketId: closed.id });
    expect(tables.Ticket).toHaveLength(1);
    expect(closed).toMatchObject({
      status: "pending",
      userId: null,
      unreadMessages: 1,
      queueId: 3
    });
    expect(tracking).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: closed.id })
    );
    expect(counter).not.toHaveBeenCalled();
    // the closed lists are cleaned with the queue the ticket had while closed
    expect(emitTicket).toHaveBeenCalledWith(
      expect.objectContaining({ id: closed.id }),
      ["company-1-closed", "queue-null-closed"]
    );
  });

  it("ignores an outbound message with no existing thread", async () => {
    const result = await IngestEmailService(account, outbound());

    expect(result).toEqual({ status: "ignored" });
    expect(findContact).not.toHaveBeenCalled();
    expect(tables.Ticket).toHaveLength(0);
    expect(tables.Message).toHaveLength(0);
    expect(tables.EmailMessage).toHaveLength(0);
    expect(emitMessage).not.toHaveBeenCalled();
  });

  it("attaches an outbound copy sent from the mailbox to its thread without reopening it", async () => {
    const closed = seedTicket({
      emailThreadKey: "m:<a1@cliente.com>",
      status: "closed",
      unreadMessages: 0
    });
    insert("EmailMessage", {
      companyId: 1,
      emailAccountId: 5,
      ticketId: closed.id,
      messageId: "first",
      direction: "in",
      providerMessageId: "INBOX:1:1",
      internetMessageId: "<a1@cliente.com>",
      fromAddress: { address: "ana@cliente.com" }
    });

    const result = await IngestEmailService(
      account,
      outbound({ inReplyTo: "<a1@cliente.com>" })
    );

    expect(result).toMatchObject({ status: "created", ticketId: closed.id });
    expect(closed).toMatchObject({ status: "closed", unreadMessages: 0 });
    expect(findContact).not.toHaveBeenCalled();
    const message = tables.Message[0];
    expect(message).toMatchObject({
      fromMe: true,
      read: true,
      ack: 1,
      channel: "email"
    });
    expect(message.contactId).toBeUndefined();
    expect(tables.EmailMessage[1]).toMatchObject({
      direction: "out",
      sendStatus: "sent"
    });
  });

  it("reconciles outbound copy by internetMessageId and marks unknown as sent", async () => {
    const ticket = seedTicket({
      emailThreadKey: "m:<a1@cliente.com>",
      status: "open"
    });
    const sent = insert("EmailMessage", {
      companyId: 1,
      emailAccountId: 5,
      ticketId: ticket.id,
      messageId: "msg-1",
      direction: "out",
      providerMessageId: null,
      internetMessageId: "<o1@empresa.com>",
      sendStatus: "unknown",
      sendError: { code: "ERR_EMAIL_SEND_UNCONFIRMED" }
    });
    const chatMessage = insert("Message", {
      id: "msg-1",
      ticketId: ticket.id,
      companyId: 1,
      ack: 0,
      fromMe: true
    });

    const result = await IngestEmailService(
      account,
      outbound({ providerThreadId: "t-7" })
    );

    expect(result).toEqual({
      status: "reconciled",
      ticketId: ticket.id,
      messageId: "msg-1"
    });
    expect(sent).toMatchObject({
      providerMessageId: "Sent:1:1",
      providerThreadId: "t-7",
      sendStatus: "sent",
      sendError: null
    });
    expect(chatMessage.ack).toBe(1);
    expect(tables.Message).toHaveLength(1);
    expect(tables.EmailMessage).toHaveLength(1);
    expect(events).toEqual(["commit", "emit:company-1-appMessage:update"]);

    // the copy shows up again (e.g. next poll): now a plain duplicate
    const again = await IngestEmailService(account, outbound());
    expect(again.status).toBe("duplicate");
  });

  it("reconciles without downgrading a failed send", async () => {
    const ticket = seedTicket({ emailThreadKey: "m:<a1@cliente.com>" });
    const sent = insert("EmailMessage", {
      companyId: 1,
      emailAccountId: 5,
      ticketId: ticket.id,
      messageId: "msg-2",
      direction: "out",
      internetMessageId: "<o1@empresa.com>",
      sendStatus: "failed"
    });
    const chatMessage = insert("Message", {
      id: "msg-2",
      ticketId: ticket.id,
      companyId: 1,
      ack: -1
    });

    const result = await IngestEmailService(account, outbound());

    expect(result.status).toBe("reconciled");
    expect(sent.sendStatus).toBe("failed");
    expect(sent.providerMessageId).toBe("Sent:1:1");
    expect(chatMessage.ack).toBe(-1);
  });

  it("never sets whatsappId and stores valid JSON in dataJson", async () => {
    await IngestEmailService(account, mail());

    const [ticket] = tables.Ticket;
    expect(ticket).toHaveProperty("whatsappId", null);
    expect((Ticket.create as jest.Mock).mock.calls[0][0].whatsappId).toBeNull();
    const [message] = tables.Message;
    expect(JSON.parse(message.dataJson)).toEqual({
      source: "email",
      emailMessageId: tables.EmailMessage[0].id,
      flags: []
    });
  });

  it("imports an oversize-flagged email and exposes the hint in dataJson", async () => {
    const result = await IngestEmailService(
      account,
      mail({ text: "", attachments: [], flags: ["oversize"] })
    );

    expect(result.status).toBe("created");
    const [message] = tables.Message;
    expect(message.body).toBe("");
    expect(JSON.parse(message.dataJson)).toEqual({
      source: "email",
      emailMessageId: tables.EmailMessage[0].id,
      flags: ["oversize"],
      oversize: true
    });
    expect(tables.EmailMessage[0].flags).toEqual(["oversize"]);
    expect(tables.EmailAttachment).toHaveLength(0);
  });

  describe("thread hijack protection (In-Reply-To/References)", () => {
    let ticket: Row;
    beforeEach(() => {
      ticket = seedTicket({
        emailThreadKey: "m:<a1@cliente.com>",
        status: "open",
        contactId: 42
      });
      insert("EmailMessage", {
        companyId: 1,
        emailAccountId: 5,
        ticketId: ticket.id,
        messageId: "first",
        direction: "in",
        providerMessageId: "INBOX:1:1",
        internetMessageId: "<a1@cliente.com>",
        fromAddress: { address: "ana@cliente.com", name: "Ana" },
        toAddresses: [{ address: "suporte@empresa.com" }],
        ccAddresses: [{ address: "Bia@Cliente.com" }]
      });
    });

    const replyFrom = (address: string, n: number) =>
      mail({
        providerMessageId: `INBOX:1:${n}`,
        internetMessageId: `<h${n}@x.com>`,
        inReplyTo: "<a1@cliente.com>",
        references: ["<a1@cliente.com>"],
        from: { address },
        subject: "Re: Pedido 123"
      });

    it("gives a stranger replying with a known Message-ID a new ticket", async () => {
      findContact.mockResolvedValueOnce({ id: 99 });

      const result = await IngestEmailService(
        account,
        replyFrom("intruso@malicioso.com", 2)
      );

      expect(result.status).toBe("created");
      expect(result.ticketId).not.toBe(ticket.id);
      expect(ticket.unreadMessages).toBe(0);
      expect(tables.Ticket.find(t => t.id === result.ticketId)).toMatchObject({
        contactId: 99,
        emailThreadKey: "m:<h2@x.com>"
      });
    });

    it("still threads the real customer and a CC'd participant", async () => {
      const customer = await IngestEmailService(
        account,
        replyFrom("ana@cliente.com", 3)
      );
      findContact.mockResolvedValueOnce({ id: 55 });
      const ccd = await IngestEmailService(
        account,
        replyFrom("bia@cliente.com", 4)
      );

      expect(customer.ticketId).toBe(ticket.id);
      expect(ccd.ticketId).toBe(ticket.id);
      expect(tables.Ticket).toHaveLength(1);
    });

    it("threads a sender matching the ticket contact's email", async () => {
      findContact.mockResolvedValueOnce({ id: 61 });
      (Contact.findOne as jest.Mock).mockResolvedValueOnce({
        id: 42,
        email: "Ana.Pessoal@Cliente.com"
      });

      const result = await IngestEmailService(
        account,
        replyFrom("ana.pessoal@cliente.com", 5)
      );

      expect(result.ticketId).toBe(ticket.id);
      expect((Contact.findOne as jest.Mock).mock.calls[0][0].where).toEqual({
        id: 42,
        companyId: 1
      });
    });

    it("does not let a mail claiming the mailbox's own address join the thread", async () => {
      findContact.mockResolvedValueOnce({ id: 70 });

      const result = await IngestEmailService(
        account,
        replyFrom("suporte@empresa.com", 6)
      );

      expect(result.ticketId).not.toBe(ticket.id);
    });

    it("ignores an outbound copy to a stranger that reuses the thread's Message-ID", async () => {
      const result = await IngestEmailService(
        account,
        outbound({
          inReplyTo: "<a1@cliente.com>",
          to: [{ address: "outra@pessoa.com" }]
        })
      );

      expect(result).toEqual({ status: "ignored" });
      expect(tables.Message).toHaveLength(0);
    });
  });

  it("keeps importing the message when an attachment is skipped", async () => {
    const big = attachment({
      filename: "video.mp4",
      content: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)
    });
    const small = attachment();

    const result = await IngestEmailService(
      account,
      mail({ attachments: [big, small] })
    );

    expect(result.status).toBe("created");
    expect(tables.Message).toHaveLength(1);
    const emailMessageId = tables.EmailMessage[0].id;
    expect(tables.EmailAttachment).toHaveLength(2);
    expect(tables.EmailAttachment[0]).toMatchObject({
      emailMessageId,
      filename: "video.mp4",
      storageKey: null,
      skippedReason: "too_large"
    });
    expect(tables.EmailAttachment[1]).toMatchObject({
      emailMessageId,
      skippedReason: null
    });
    const stored = path.join(
      mockPrivateDir,
      tables.EmailAttachment[1].storageKey
    );
    expect(fs.readFileSync(stored, "utf8")).toBe("conteudo");
  });

  it("removes stored attachment files and emits nothing when the transaction fails", async () => {
    (Message.create as jest.Mock).mockRejectedValueOnce(new Error("db down"));

    await expect(
      IngestEmailService(
        account,
        mail({ attachments: [attachment(), attachment()] })
      )
    ).rejects.toThrow("db down");

    expect(filesUnder(mockPrivateDir)).toEqual([]);
    expect(tables.Ticket).toHaveLength(0);
    expect(tables.EmailMessage).toHaveLength(0);
    expect(tables.EmailAttachment).toHaveLength(0);
    expect(emitMessage).not.toHaveBeenCalled();
    expect(emitTicket).not.toHaveBeenCalled();
  });

  it("emits the websocket events only after the commit", async () => {
    emitMessage.mockImplementation(async (message: Row) => {
      // the committed rows are visible to whoever reacts to the event
      expect(tables.Message.map(m => m.id)).toContain(message.id);
      events.push("emit:appMessage:create");
    });

    await IngestEmailService(account, mail());

    expect(events).toEqual([
      "commit",
      "emit:appMessage:create",
      "emit:ticket:update"
    ]);
    expect(emitMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket: expect.objectContaining({ id: tables.Ticket[0].id })
      })
    );
  });

  it("skips every websocket event for a non-compliant company but still imports", async () => {
    (checkCompanyCompliant as jest.Mock).mockResolvedValue(false);

    const result = await IngestEmailService(account, mail());

    expect(result.status).toBe("created");
    expect(tables.Message).toHaveLength(1);
    expect(checkCompanyCompliant).toHaveBeenCalledWith(1);
    expect(emitMessage).not.toHaveBeenCalled();
    expect(emitTicket).not.toHaveBeenCalled();
    expect(events).toEqual(["commit"]);
  });

  it("still returns created when emitting fails after the commit", async () => {
    emitMessage.mockRejectedValueOnce(new Error("socket down"));
    const result = await IngestEmailService(
      account,
      mail({ attachments: [attachment()] })
    );

    expect(result.status).toBe("created");
    expect(filesUnder(mockPrivateDir)).toHaveLength(1);
  });

  it("a bounce marks the original outbound as failed ERR_EMAIL_BOUNCED and creates no ticket", async () => {
    const ticket = seedTicket({
      emailThreadKey: "m:<a1@cliente.com>",
      status: "open"
    });
    const sent = insert("EmailMessage", {
      companyId: 1,
      emailAccountId: 5,
      ticketId: ticket.id,
      messageId: "msg-3",
      direction: "out",
      internetMessageId: "<s2@empresa.com>",
      sendStatus: "sent"
    });
    const chatMessage = insert("Message", {
      id: "msg-3",
      ticketId: ticket.id,
      companyId: 1,
      ack: 1
    });

    const result = await IngestEmailService(
      account,
      mail({
        providerMessageId: "INBOX:1:50",
        internetMessageId: "<bounce1@mx.empresa.com>",
        from: { address: "mailer-daemon@googlemail.com" },
        subject: "Delivery Status Notification (Failure)",
        flags: ["bounce"],
        bounceOf: "<s2@empresa.com>"
      })
    );

    expect(result).toEqual({ status: "ignored" });
    expect(sent.sendStatus).toBe("failed");
    expect(sent.sendError).toMatchObject({ code: "ERR_EMAIL_BOUNCED" });
    expect(chatMessage.ack).toBe(-1);
    expect(tables.Ticket).toHaveLength(1);
    expect(tables.Message).toHaveLength(1);
    expect(tables.EmailMessage).toHaveLength(1);
    expect(findContact).not.toHaveBeenCalled();
    expect(events).toEqual(["commit", "emit:company-1-appMessage:update"]);
  });

  it("drops a bounce that does not point to one of our sends", async () => {
    const result = await IngestEmailService(
      account,
      mail({
        flags: ["bounce"],
        bounceOf: "<nao-existe@x.com>",
        from: { address: "postmaster@x.com" }
      })
    );
    const noRef = await IngestEmailService(
      account,
      mail({
        providerMessageId: "INBOX:1:2",
        flags: ["bounce"],
        from: { address: "postmaster@x.com" }
      })
    );

    expect(result).toEqual({ status: "ignored" });
    expect(noRef).toEqual({ status: "ignored" });
    expect(tables.Ticket).toHaveLength(0);
    expect(findContact).not.toHaveBeenCalled();
  });

  it("ignores an inbound email without a usable counterpart and logs no content (R16)", async () => {
    const result = await IngestEmailService(
      account,
      mail({
        from: { address: "" },
        subject: "segredo do assunto",
        text: "segredo do corpo"
      })
    );

    expect(result).toEqual({ status: "ignored" });
    expect(findContact).not.toHaveBeenCalled();
    expect(tables.Ticket).toHaveLength(0);
    expect(tables.Message).toHaveLength(0);
    const logged = JSON.stringify([
      (logger.info as jest.Mock).mock.calls,
      (logger.warn as jest.Mock).mock.calls,
      (logger.debug as jest.Mock).mock.calls
    ]);
    expect(logged).not.toMatch(/segredo|suporte@empresa\.com|cliente\.com/);
  });

  it("ignores an outbound copy without recipients and an invalid sender address", async () => {
    const noRecipient = await IngestEmailService(account, outbound({ to: [] }));
    findContact.mockRejectedValueOnce(
      new AppError("ERR_EMAIL_INVALID_ADDRESS", 400)
    );
    const invalid = await IngestEmailService(
      account,
      mail({
        providerMessageId: "INBOX:1:9",
        from: { address: "ana@cliente.com" }
      })
    );

    expect(noRecipient).toEqual({ status: "ignored" });
    expect(invalid).toEqual({ status: "ignored" });
    expect(tables.Ticket).toHaveLength(0);
  });

  it("refuses an email normalized for another account", async () => {
    await expect(
      IngestEmailService(account, mail({ accountId: 6 }))
    ).rejects.toThrow("ERR_EMAIL_ACCOUNT_MISMATCH");
    expect(tables.Ticket).toHaveLength(0);
  });

  it("stores over-long message ids in a form that fits the column and still threads", async () => {
    const longId = `<${"x".repeat(300)}@cliente.com>`;
    const first = await IngestEmailService(
      account,
      mail({ internetMessageId: longId })
    );
    const reply = await IngestEmailService(
      account,
      mail({
        providerMessageId: "INBOX:1:2",
        internetMessageId: "<r@cliente.com>",
        inReplyTo: longId
      })
    );

    expect(tables.EmailMessage[0].internetMessageId.length).toBeLessThanOrEqual(
      255
    );
    expect(tables.Ticket[0].emailThreadKey.length).toBeLessThanOrEqual(255);
    expect(tables.EmailMessage[1].inReplyTo).toBe(
      tables.EmailMessage[0].internetMessageId
    );
    expect(reply.ticketId).toBe(first.ticketId);
  });
});

describe("FindOrCreateEmailTicketService", () => {
  beforeEach(() => {
    tables = { Ticket: [], EmailMessage: [], Message: [], EmailAttachment: [] };
    nextId = 500;
    events = [];
    transactionMock.mockImplementation(async (cb: (tx: FakeTx) => unknown) => {
      const tx: FakeTx = {
        undo: [],
        hooks: [],
        afterCommit(fn) {
          this.hooks.push(fn);
        }
      };
      const result = await cb(tx);
      // eslint-disable-next-line no-restricted-syntax
      for (const hook of tx.hooks) await hook(tx);
      return result;
    });
    queryMock.mockResolvedValue([]);
    (Ticket.findOne as jest.Mock).mockImplementation(findOne("Ticket"));
    (Ticket.create as jest.Mock).mockImplementation(create("Ticket"));
    tracking.mockResolvedValue({});
    counter.mockResolvedValue(undefined);
  });

  it("serializes by thread and never creates a second active ticket for the same thread key", async () => {
    const active = seedTicket({
      emailThreadKey: "g:t-1",
      status: "open",
      unreadMessages: 2
    });
    seedTicket({ emailThreadKey: "g:t-1", status: "closed" });

    const result = await FindOrCreateEmailTicketService({
      account,
      contact: { id: 42 } as any,
      threadKey: "g:t-1",
      subject: "Pedido",
      reopen: true
    });

    expect(result).toMatchObject({ justCreated: false, ticket: active });
    expect(active.unreadMessages).toBe(3);
    expect(tables.Ticket).toHaveLength(2);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      expect.objectContaining({
        replacements: { lockKey: "email-thread:1:5:g:t-1" },
        transaction: expect.anything()
      })
    );
  });

  it("creates the ticket with whatsappId null and counts it after commit", async () => {
    const result = await FindOrCreateEmailTicketService({
      account,
      contact: { id: 42 } as any,
      threadKey: "m:<n@x.com>",
      subject: "Novo",
      reopen: true
    });

    expect(result.justCreated).toBe(true);
    expect(result.ticket).toMatchObject({
      channel: "email",
      status: "pending",
      whatsappId: null,
      emailAccountId: 5,
      emailThreadKey: "m:<n@x.com>",
      queueId: 3,
      subject: "Novo"
    });
    expect(counter).toHaveBeenCalledWith(1, "ticket-create");
  });
});
