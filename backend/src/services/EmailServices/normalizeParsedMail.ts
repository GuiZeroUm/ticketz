import { extension } from "mime-types";
import { convert } from "html-to-text";
import type { AddressObject, Attachment, ParsedMail } from "mailparser";
import { normalizeEmailAddress } from "./addresses";
import sanitizeEmailHtml from "./sanitizeEmailHtml";
import { EmailAddress, NormalizedAttachment, NormalizedEmail } from "./types";

type Meta = {
  accountId: number;
  direction: "in" | "out";
  providerMessageId: string;
  providerThreadId?: string;
  flags?: string[];
};

const BOUNCE_SENDER_RE = /^(?:mailer-daemon|mailerdaemon|postmaster)$/i;
const MESSAGE_ID_RE = /^message-id:[ \t]*\r?\n?[ \t]*(<[^>\r\n]+>)/im;

const toAddresses = (
  field: AddressObject | AddressObject[] | undefined
): EmailAddress[] => {
  if (!field) return [];
  const objects = Array.isArray(field) ? field : [field];
  const result: EmailAddress[] = [];
  objects.forEach(obj => {
    (obj?.value || []).forEach(entry => {
      const address = entry.address
        ? normalizeEmailAddress(entry.address)
        : null;
      if (!address) return;
      const name = entry.name?.trim();
      result.push(name ? { address, name } : { address });
    });
  });
  return result;
};

const toReferences = (references: string | string[] | undefined): string[] => {
  if (!references) return [];
  const list = Array.isArray(references) ? references : references.split(/\s+/);
  return list.map(ref => ref.trim()).filter(Boolean);
};

const htmlToPlainText = (html: string): string =>
  convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      {
        selector: "a",
        options: { ignoreHref: false, hideLinkHrefIfSameAsText: true }
      }
    ]
  })
    .replace(/\r\n?/g, "\n")
    .trim();

const toAttachment = (att: Attachment, index: number): NormalizedAttachment => {
  const content = Buffer.isBuffer(att.content)
    ? att.content
    : Buffer.from(att.content || "");
  const contentType = (
    att.contentType || "application/octet-stream"
  ).toLowerCase();
  const rawCid = att.cid || att.contentId;
  const contentId = rawCid ? rawCid.replace(/^<|>$/g, "") : undefined;
  const ext = extension(contentType);
  const filename =
    att.filename?.trim() ||
    `${contentId || `anexo-${index + 1}`}${ext ? `.${ext}` : ""}`;
  return {
    filename,
    contentType,
    size: typeof att.size === "number" ? att.size : content.length,
    content,
    ...(contentId ? { contentId } : {}),
    inline:
      Boolean(contentId) &&
      (Boolean(att.related) || att.contentDisposition === "inline")
  };
};

type StructuredHeader = {
  value?: string;
  params?: Record<string, string>;
};

const headerValue = (
  parsed: ParsedMail,
  name: string
): StructuredHeader | undefined =>
  parsed.headers?.get?.(name) as StructuredHeader | undefined;

const isDeliveryStatusReport = (parsed: ParsedMail): boolean => {
  const contentType = headerValue(parsed, "content-type");
  const value = String(contentType?.value || "").toLowerCase();
  const reportType = String(
    contentType?.params?.["report-type"] || ""
  ).toLowerCase();
  if (value === "multipart/report" && reportType === "delivery-status") {
    return true;
  }
  return (parsed.attachments || []).some(
    att => (att.contentType || "").toLowerCase() === "message/delivery-status"
  );
};

const findEmbeddedMessageId = (parsed: ParsedMail): string | undefined => {
  const embedded = (parsed.attachments || []).filter(att =>
    ["message/rfc822", "text/rfc822-headers"].includes(
      (att.contentType || "").toLowerCase()
    )
  );
  const ids = embedded.map(att => {
    const content = Buffer.isBuffer(att.content)
      ? att.content.toString("utf8")
      : String(att.content || "");
    return content.match(MESSAGE_ID_RE)?.[1];
  });
  return ids.find(Boolean);
};

export function normalizeParsedMail(
  parsed: ParsedMail,
  meta: Meta
): NormalizedEmail {
  const from = toAddresses(parsed.from)[0] ?? { address: "" };

  const rawText = (parsed.text || "").replace(/\r\n?/g, "\n").trim();
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const text = rawText || (html ? htmlToPlainText(html) : "");
  const htmlSanitized = html ? sanitizeEmailHtml(html) : "";

  const flags = [...(meta.flags || [])];
  const bounce =
    isDeliveryStatusReport(parsed) ||
    BOUNCE_SENDER_RE.test(from.address.split("@")[0] || "");
  if (bounce && !flags.includes("bounce")) flags.push("bounce");

  let bounceOf: string | undefined;
  if (flags.includes("bounce")) {
    bounceOf = findEmbeddedMessageId(parsed) || parsed.inReplyTo || undefined;
  }

  const date =
    parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime())
      ? parsed.date
      : new Date();

  return {
    accountId: meta.accountId,
    direction: meta.direction,
    providerMessageId: meta.providerMessageId,
    ...(meta.providerThreadId
      ? { providerThreadId: meta.providerThreadId }
      : {}),
    ...(parsed.messageId ? { internetMessageId: parsed.messageId } : {}),
    ...(parsed.inReplyTo ? { inReplyTo: parsed.inReplyTo } : {}),
    references: toReferences(parsed.references),
    from,
    replyTo: toAddresses(parsed.replyTo),
    to: toAddresses(parsed.to),
    cc: toAddresses(parsed.cc),
    subject: parsed.subject || "",
    text,
    ...(htmlSanitized ? { htmlSanitized } : {}),
    attachments: (parsed.attachments || []).map(toAttachment),
    receivedAt: date,
    flags,
    ...(bounceOf ? { bounceOf } : {})
  };
}

export default normalizeParsedMail;
