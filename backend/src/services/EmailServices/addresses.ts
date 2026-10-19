import { EmailAddress } from "./types";

const ADDRESS_RE =
  /^[^\s@<>()[\],;:"\\]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

const isValidAddress = (value: string): boolean =>
  value.length <= 254 &&
  ADDRESS_RE.test(value) &&
  !value.includes("..") &&
  !/^\.|\.@|@\./.test(value);

// Splits on commas/semicolons that are outside quotes and angle brackets.
const splitList = (raw: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngle = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "\\" && inQuotes && i + 1 < raw.length) {
      current += ch + raw[i + 1];
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (!inQuotes && ch === "<") {
      inAngle = true;
      current += ch;
    } else if (!inQuotes && ch === ">") {
      inAngle = false;
      current += ch;
    } else if (!inQuotes && !inAngle && (ch === "," || ch === ";")) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map(p => p.trim()).filter(Boolean);
};

const cleanName = (name: string): string | undefined => {
  let result = name.trim();
  if (result.startsWith('"') && result.endsWith('"') && result.length >= 2) {
    result = result.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  result = result.trim();
  return result || undefined;
};

type ParsedEntry = { address: string; name?: string } | null;

const parseEntry = (entry: string): ParsedEntry => {
  const match = entry.match(/^(.*)<([^<>]*)>\s*$/s);
  if (match) {
    const address = match[2].trim().toLowerCase();
    if (!isValidAddress(address)) return null;
    const name = cleanName(match[1]);
    return name ? { address, name } : { address };
  }
  const address = entry.trim().toLowerCase();
  return isValidAddress(address) ? { address } : null;
};

export function normalizeEmailAddress(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const entries = splitList(raw);
  if (entries.length !== 1) return null;
  return parseEntry(entries[0])?.address ?? null;
}

export function parseAddressList(raw: string | string[]): {
  valid: EmailAddress[];
  invalid: string[];
} {
  const items = (Array.isArray(raw) ? raw : [raw]).flatMap(item =>
    typeof item === "string" ? splitList(item) : []
  );
  const valid: EmailAddress[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  items.forEach(item => {
    const parsed = parseEntry(item);
    if (!parsed) {
      invalid.push(item);
      return;
    }
    if (seen.has(parsed.address)) return;
    seen.add(parsed.address);
    valid.push(parsed);
  });
  return { valid, invalid };
}
