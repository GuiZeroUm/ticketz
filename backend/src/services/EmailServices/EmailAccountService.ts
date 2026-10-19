import { Op, UniqueConstraintError } from "sequelize";
import AppError from "../../errors/AppError";
import serializeEmailAccount from "../../helpers/SerializeEmailAccount";
import EmailAccount from "../../models/EmailAccount";
import Queue from "../../models/Queue";
import { enqueueAccountSync } from "../../queues/email";
import { logger } from "../../utils/logger";
import { EmailAuthError, testImapSmtp } from "./adapters";
import {
  SYNCABLE_STATUSES,
  emitEmailAccount
} from "./EmailAccountStatusService";
import { EMAIL_PRESETS } from "./presets";

type Endpoint = { host: string; port: number; secure: boolean };

type Mailbox = {
  address: string;
  password: string;
  imap: Endpoint;
  smtp: Endpoint;
};

type MailboxBody = {
  preset?: unknown;
  address?: unknown;
  password?: unknown;
  imap?: unknown;
  smtp?: unknown;
};

export type CreateEmailAccountInput = MailboxBody & {
  name?: unknown;
  queueId?: unknown;
};

export type UpdateEmailAccountInput = {
  name?: unknown;
  queueId?: unknown;
  password?: unknown;
};

const NOT_FOUND = "ERR_EMAIL_ACCOUNT_NOT_FOUND";
const INVALID = "ERR_EMAIL_INVALID_ACCOUNT";
const CONNECTION_FAILED = "ERR_EMAIL_CONNECTION_FAILED";
const FIXED_CODE = /^ERR_EMAIL_\w+$/;
const ADDRESS_PATTERN = /^[^\s@<>"',;()]+@[^\s@<>"',;()]+\.[^\s@<>"',;()]+$/;

const MAX_ADDRESS_LENGTH = 254;
const MAX_NAME_LENGTH = 255;
const MAX_HOST_LENGTH = 253;
const MAX_PASSWORD_LENGTH = 1024;

const invalid = () => new AppError(INVALID, 400);
const notFound = () => new AppError(NOT_FOUND, 404);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseAddress = (value: unknown): string => {
  const address = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    !address ||
    address.length > MAX_ADDRESS_LENGTH ||
    !ADDRESS_PATTERN.test(address)
  ) {
    throw invalid();
  }
  return address;
};

const parsePassword = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_PASSWORD_LENGTH
  ) {
    throw invalid();
  }
  return value;
};

const parseName = (value: unknown, fallback?: string): string => {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    throw invalid();
  }
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) throw invalid();
  return name;
};

const parseEndpoint = (value: unknown, implicitTlsPort: number): Endpoint => {
  if (!isRecord(value)) throw invalid();
  const host = typeof value.host === "string" ? value.host.trim() : "";
  const port = Number(value.port);
  if (
    !host ||
    host.length > MAX_HOST_LENGTH ||
    typeof value.port === "boolean" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw invalid();
  }
  // Which ports are acceptable is decided later by resolveSafeMailEndpoint.
  const secure =
    typeof value.secure === "boolean" ? value.secure : port === implicitTlsPort;
  return { host, port, secure };
};

const presetEndpoints = (preset: "icloud") => ({
  imap: { ...EMAIL_PRESETS[preset].imap },
  smtp: { ...EMAIL_PRESETS[preset].smtp }
});

// icloud always uses the server side presets (whatever hosts the client sent);
// custom hosts are only syntax checked here, the anti-SSRF resolution happens
// inside the adapter.
const parseMailbox = (body: MailboxBody) => {
  if (body.preset === "gmail") {
    // Gmail connects through OAuth, never through a password.
    throw new AppError("ERR_EMAIL_PROVIDER_NOT_SUPPORTED", 400);
  }
  if (body.preset !== "icloud" && body.preset !== "custom") throw invalid();

  const address = parseAddress(body.address);
  const password = parsePassword(body.password);
  const endpoints =
    body.preset === "icloud"
      ? presetEndpoints("icloud")
      : {
          imap: parseEndpoint(body.imap, 993),
          smtp: parseEndpoint(body.smtp, 465)
        };

  return {
    preset: body.preset as "icloud" | "custom",
    mailbox: { address, password, ...endpoints } as Mailbox
  };
};

// Provider/server text never reaches the client: only our fixed codes do.
const testMailbox = async (mailbox: Mailbox): Promise<void> => {
  try {
    await testImapSmtp(mailbox);
  } catch (error) {
    if (error instanceof EmailAuthError) {
      throw new AppError("ERR_EMAIL_AUTH_FAILED", 400);
    }
    if (error instanceof AppError && FIXED_CODE.test(error.message)) {
      throw error;
    }
    throw new AppError(CONNECTION_FAILED, 400);
  }
};

const resolveQueueId = async (
  companyId: number,
  value: unknown
): Promise<number | null> => {
  if (value === undefined || value === null || value === "") return null;
  const queueId = Number(value);
  if (!Number.isInteger(queueId) || queueId < 1) {
    throw new AppError("ERR_QUEUE_NOT_FOUND", 404);
  }
  const queue = await Queue.findOne({
    where: { id: queueId, companyId },
    attributes: ["id"]
  });
  if (!queue) throw new AppError("ERR_QUEUE_NOT_FOUND", 404);
  return queueId;
};

const enqueueSync = async (account: EmailAccount): Promise<void> => {
  try {
    await enqueueAccountSync(account.id);
  } catch {
    // The account is saved; the minute tick picks it up anyway.
    logger.warn(
      { companyId: account.companyId, emailAccountId: account.id },
      "Could not enqueue email account sync"
    );
  }
};

const findCompanyAccount = async (
  companyId: number,
  id: number,
  { withSecrets = false } = {}
): Promise<EmailAccount | null> => {
  if (!Number.isInteger(id) || id < 1) return null;
  const model = withSecrets ? EmailAccount.scope("withSecrets") : EmailAccount;
  return model.findOne({ where: { id, companyId } });
};

const requireActiveAccount = async (
  companyId: number,
  id: number,
  options?: { withSecrets?: boolean }
): Promise<EmailAccount> => {
  const account = await findCompanyAccount(companyId, id, options);
  if (!account || account.status === "disabled") throw notFound();
  return account;
};

export const listEmailAccounts = async (companyId: number) => {
  const accounts = await EmailAccount.findAll({
    where: { companyId, status: { [Op.ne]: "disabled" } },
    order: [["id", "ASC"]]
  });
  return accounts.map(serializeEmailAccount);
};

export const testEmailAccount = async (body: MailboxBody): Promise<void> => {
  await testMailbox(parseMailbox(body).mailbox);
};

const applyMailbox = (
  account: EmailAccount,
  preset: "icloud" | "custom",
  { password, imap, smtp }: Mailbox
) => {
  account.set({
    provider: "imap_smtp",
    preset,
    imapHost: imap.host,
    imapPort: imap.port,
    imapSecure: imap.secure,
    smtpHost: smtp.host,
    smtpPort: smtp.port,
    smtpSecure: smtp.secure,
    status: "active",
    errorCount: 0,
    lastError: null,
    lastSyncAt: null
  });
  account.setCredentials({ password });
};

export const createEmailAccount = async (
  companyId: number,
  userId: number,
  body: CreateEmailAccountInput
) => {
  const { preset, mailbox } = parseMailbox(body);
  const name = parseName(body.name, mailbox.address);
  const queueId = await resolveQueueId(companyId, body.queueId);

  const existing = await EmailAccount.findOne({
    where: { companyId, address: mailbox.address }
  });
  // A disabled account of another provider is not reused either: the
  // providerMessageId format differs, so the old messages would be imported twice.
  if (
    existing &&
    (existing.status !== "disabled" || existing.provider !== "imap_smtp")
  ) {
    throw new AppError("ERR_EMAIL_ACCOUNT_EXISTS", 409);
  }

  await testMailbox(mailbox);

  let account: EmailAccount;
  if (existing) {
    // (companyId, address) is unique: reconnecting a disabled mailbox reuses
    // its row, so the tickets it already has stay attached to it. The cursor is
    // reset: messages are deduplicated by providerMessageId on the next import.
    account = existing;
    account.set({
      name,
      queueId,
      connectedByUserId: userId,
      scopes: [],
      externalId: null,
      syncCursor: null
    });
    applyMailbox(account, preset, mailbox);
  } else {
    account = EmailAccount.build({
      companyId,
      provider: "imap_smtp",
      preset,
      name,
      address: mailbox.address,
      status: "active",
      queueId,
      connectedByUserId: userId,
      imapHost: mailbox.imap.host,
      imapPort: mailbox.imap.port,
      imapSecure: mailbox.imap.secure,
      smtpHost: mailbox.smtp.host,
      smtpPort: mailbox.smtp.port,
      smtpSecure: mailbox.smtp.secure,
      scopes: [],
      errorCount: 0
    });
    account.setCredentials({ password: mailbox.password });
  }

  try {
    await account.save();
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new AppError("ERR_EMAIL_ACCOUNT_EXISTS", 409);
    }
    throw error;
  }

  await enqueueSync(account);
  emitEmailAccount(account, "create");
  return serializeEmailAccount(account);
};

export const updateEmailAccount = async (
  companyId: number,
  id: number,
  body: UpdateEmailAccountInput
) => {
  const account = await requireActiveAccount(companyId, id, {
    withSecrets: true
  });

  if (body.name !== undefined) {
    account.set({ name: parseName(body.name) });
  }
  if (body.queueId !== undefined) {
    account.set({ queueId: await resolveQueueId(companyId, body.queueId) });
  }

  let newPassword = false;
  if (body.password !== undefined) {
    if (account.provider !== "imap_smtp") {
      throw new AppError("ERR_EMAIL_PROVIDER_NOT_SUPPORTED", 400);
    }
    const password = parsePassword(body.password);
    const endpoints =
      account.preset === "icloud"
        ? presetEndpoints("icloud")
        : {
            imap: {
              host: account.imapHost,
              port: account.imapPort,
              secure: Boolean(account.imapSecure)
            },
            smtp: {
              host: account.smtpHost,
              port: account.smtpPort,
              secure: Boolean(account.smtpSecure)
            }
          };
    if (
      !endpoints.imap.host ||
      !endpoints.imap.port ||
      !endpoints.smtp.host ||
      !endpoints.smtp.port
    ) {
      throw new AppError(CONNECTION_FAILED, 400);
    }
    await testMailbox({ address: account.address, password, ...endpoints });

    account.setCredentials({ password });
    account.set({ status: "active", errorCount: 0, lastError: null });
    newPassword = true;
  }

  await account.save();
  if (newPassword) await enqueueSync(account);
  emitEmailAccount(account, "update");
  return serializeEmailAccount(account);
};

// Wipes the secrets and stops the account; its tickets and messages stay.
// Provider specific teardown (revoking the Gmail token, stopping the watch)
// belongs here, which is why the account must be loaded withSecrets.
export const disableEmailAccount = async (
  account: EmailAccount
): Promise<void> => {
  account.setCredentials(null);
  account.set({
    status: "disabled",
    syncCursor: null,
    errorCount: 0,
    lastError: null,
    watchExpiresAt: null
  });
  await account.save();
};

export const deleteEmailAccount = async (
  companyId: number,
  id: number
): Promise<void> => {
  const account = await findCompanyAccount(companyId, id, {
    withSecrets: true
  });
  if (!account) throw notFound();
  // Already disabled: nothing left to wipe or announce.
  if (account.status === "disabled") return;

  await disableEmailAccount(account);
  emitEmailAccount(account, "delete");
};

export const requestEmailAccountSync = async (
  companyId: number,
  id: number
): Promise<void> => {
  const account = await requireActiveAccount(companyId, id);
  if (!(SYNCABLE_STATUSES as readonly string[]).includes(account.status)) {
    throw new AppError("ERR_EMAIL_ACCOUNT_UNAVAILABLE", 409);
  }
  try {
    await enqueueAccountSync(account.id);
  } catch {
    logger.warn(
      { companyId, emailAccountId: account.id },
      "Could not enqueue email account sync"
    );
    throw new AppError("ERR_EMAIL_SYNC_ENQUEUE_FAILED", 503);
  }
};
