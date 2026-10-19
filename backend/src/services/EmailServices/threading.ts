import { MAX_REFERENCES } from "./limits";

const PREFIXES_RE =
  /^\s*(?:(?:re|res|aw|sv|fwd|fw|enc|wg)(?:\s*\[\d+\])?\s*:\s*)+/i;
const REPLY_RE = /^\s*(?:re|res|aw|sv)(?:\s*\[\d+\])?\s*:/i;
const FORWARD_RE = /^\s*(?:fwd|fw|enc|wg)\s*:/i;

export function normalizeSubject(subject: string): string {
  return (subject || "")
    .replace(PREFIXES_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function replySubject(
  subject: string,
  mode: "reply" | "replyAll" | "forward"
): string {
  const base = (subject || "").trim();
  if (mode === "forward") {
    return FORWARD_RE.test(base) ? base : `Fwd: ${base}`.trim();
  }
  return REPLY_RE.test(base) ? base : `Re: ${base}`.trim();
}

export function buildReferences(
  previous: string[],
  parentMessageId?: string
): string[] {
  const refs = (previous || []).filter(Boolean);
  if (parentMessageId) {
    const idx = refs.indexOf(parentMessageId);
    if (idx !== -1) refs.splice(idx, 1);
    refs.push(parentMessageId);
  }
  return refs.slice(-MAX_REFERENCES);
}
