import fs, { ReadStream } from "fs";
import path from "path";
import { Transaction } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import AppError from "../../errors/AppError";
import privateFiles from "../../config/privateFiles";
import EmailAttachment from "../../models/EmailAttachment";
import { MAX_ATTACHMENT_BYTES, MAX_INBOUND_ATTACHMENTS_BYTES } from "./limits";
import { NormalizedAttachment } from "./types";

// Attachments live under <private>/email/<companyId>/<emailMessageId>/<uuid>.
// The private directory is never exposed by the /public mount; the only way to
// read a file is openAttachment(), which always checks the owning company.

const STORAGE_ROOT = "email";
const FILENAME_FALLBACK = "anexo";
const MAX_FILENAME_LENGTH = 255;
const STORAGE_KEY_PATTERN = /^email\/(\d+)\/(\d+)\/[A-Za-z0-9-]+$/;

const INLINE_SAFE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf"
]);

const notFound = () => new AppError("ERR_EMAIL_ATTACHMENT_NOT_FOUND", 404);

export const safeInlineContentType = (contentType: string): string => {
  const base = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return INLINE_SAFE_TYPES.has(base) ? base : "application/octet-stream";
};

const truncateKeepingExtension = (name: string): string => {
  if (name.length <= MAX_FILENAME_LENGTH) return name;
  const ext = path.extname(name);
  const keepExt = ext.length > 0 && ext.length <= 20 ? ext : "";
  return name.slice(0, MAX_FILENAME_LENGTH - keepExt.length) + keepExt;
};

const isUnsafeFilenameChar = (char: string): boolean => {
  const code = char.charCodeAt(0);
  return (
    char === "/" ||
    char === "\\" ||
    code <= 0x1f || // C0 controls
    (code >= 0x7f && code <= 0x9f) || // DEL and C1 controls
    code === 0x2028 || // line/paragraph separators
    code === 0x2029 ||
    (code >= 0x202a && code <= 0x202e) || // bidi embeddings/overrides
    (code >= 0x2066 && code <= 0x2069) // bidi isolates
  );
};

// The display name is data only (the disk name is a uuid), but it ends up in
// Content-Disposition headers and the UI, so strip separators, traversal
// sequences, control characters and bidi overrides.
export const sanitizeFilename = (filename: string): string => {
  const cleaned = Array.from(String(filename ?? ""))
    .map(char => (isUnsafeFilenameChar(char) ? "_" : char))
    .join("")
    .replace(/_{2,}/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "");
  return truncateKeepingExtension(cleaned) || FILENAME_FALLBACK;
};

const limited = (value: string | undefined | null): string | null =>
  value ? value.slice(0, 255) : null;

const resolveStoragePath = (
  companyId: number,
  storageKey: string
): string | null => {
  const match = STORAGE_KEY_PATTERN.exec(storageKey);
  if (!match || Number(match[1]) !== companyId) return null;

  const companyRoot = path.resolve(
    privateFiles.directory,
    STORAGE_ROOT,
    String(companyId)
  );
  const resolved = path.resolve(privateFiles.directory, storageKey);
  return resolved.startsWith(companyRoot + path.sep) ? resolved : null;
};

// Best-effort removal of files written by saveInboundAttachments. Keys that do
// not have the exact storage shape are ignored, so a bad value can never make
// this delete anything outside <private>/email/<companyId>/. Never throws.
//
// Sequelize 6 has no rollback hook (only transaction.afterCommit), so a caller
// that passes a transaction must call this in its own catch/rollback path:
//   removeStoredAttachments(saved.map(a => a.storageKey).filter(Boolean))
export const removeStoredAttachments = async (
  storageKeys: (string | null | undefined)[]
): Promise<void> => {
  const dirs = new Set<string>();
  await Promise.all(
    storageKeys.map(async key => {
      const match = key ? STORAGE_KEY_PATTERN.exec(key) : null;
      if (!key || !match) return;
      const filePath = resolveStoragePath(Number(match[1]), key);
      if (!filePath) return;
      try {
        await fs.promises.rm(filePath, { force: true });
        dirs.add(path.dirname(filePath));
      } catch {
        // best effort
      }
    })
  );
  // drop the per-message directory when it ended up empty (non-recursive)
  await Promise.all(
    Array.from(dirs).map(dir => fs.promises.rmdir(dir).catch(() => undefined))
  );
};

export const saveInboundAttachments = async (
  companyId: number,
  emailMessageId: number,
  atts: NormalizedAttachment[],
  opts: { transaction?: Transaction } = {}
): Promise<EmailAttachment[]> => {
  const saved: EmailAttachment[] = [];
  const writtenKeys: string[] = [];
  const relativeDir = `${STORAGE_ROOT}/${companyId}/${emailMessageId}`;
  const absoluteDir = path.join(
    privateFiles.directory,
    STORAGE_ROOT,
    String(companyId),
    String(emailMessageId)
  );
  const createOptions = opts.transaction
    ? { transaction: opts.transaction }
    : undefined;
  let storedBytes = 0;

  try {
    // eslint-disable-next-line no-restricted-syntax
    for (const att of atts) {
      // The declared size comes from the parsed message; trust the real buffer.
      const size = att.content.length;
      const base = {
        companyId,
        emailMessageId,
        filename: sanitizeFilename(att.filename),
        contentType: limited(att.contentType),
        size,
        contentId: limited(att.contentId),
        inline: att.inline
      };

      let skippedReason: string | null = null;
      if (size > MAX_ATTACHMENT_BYTES) {
        skippedReason = "too_large";
      } else if (storedBytes + size > MAX_INBOUND_ATTACHMENTS_BYTES) {
        skippedReason = "message_too_large";
      }

      if (skippedReason) {
        saved.push(
          await EmailAttachment.create(
            { ...base, storageKey: null, skippedReason },
            createOptions
          )
        );
      } else {
        const name = uuidv4();
        const storageKey = `${relativeDir}/${name}`;

        await fs.promises.mkdir(absoluteDir, { recursive: true, mode: 0o700 });
        // registered before the write so a partial write is cleaned up too
        writtenKeys.push(storageKey);

        await fs.promises.writeFile(
          path.join(absoluteDir, name),
          new Uint8Array(
            att.content.buffer,
            att.content.byteOffset,
            att.content.length
          ),
          { flag: "wx", mode: 0o600 }
        );
        saved.push(
          await EmailAttachment.create(
            { ...base, storageKey, skippedReason: null },
            createOptions
          )
        );
        storedBytes += size;
      }
    }
  } catch (err) {
    // Whatever this call wrote is removed before rethrowing, with or without
    // a transaction: the caller is going to roll back / abort anyway.
    await removeStoredAttachments(writtenKeys);
    throw err;
  }

  return saved;
};

export const openAttachment = async (
  companyId: number,
  attachmentId: number
): Promise<{ attachment: EmailAttachment; stream: ReadStream }> => {
  const attachment = await EmailAttachment.findOne({
    where: { id: attachmentId, companyId }
  });
  if (
    !attachment ||
    attachment.companyId !== companyId ||
    !attachment.storageKey
  ) {
    throw notFound();
  }

  const filePath = resolveStoragePath(companyId, attachment.storageKey);
  if (!filePath) throw notFound();

  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) throw notFound();
  } catch {
    throw notFound();
  }

  return { attachment, stream: fs.createReadStream(filePath) };
};
