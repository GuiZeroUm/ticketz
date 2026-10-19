const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Same markers as WhatsApp: *bold* and _italic_, only at word boundaries.
const BOLD_RE = /(^|[\s(])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?=$|[\s.,;:!?)])/g;
const ITALIC_RE = /(^|[\s(])_([^\s_](?:[^_\n]*[^\s_])?)_(?=$|[\s.,;:!?)])/g;

const applyMarkers = (line: string): string =>
  line
    .replace(BOLD_RE, "$1<strong>$2</strong>")
    .replace(ITALIC_RE, "$1<em>$2</em>");

export function renderEmailHtml(text: string): string {
  const normalized = (text || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  return normalized
    .split(/\n[ \t]*\n+/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .map(
      paragraph =>
        `<p>${paragraph
          .split("\n")
          .map(line => applyMarkers(escapeHtml(line)))
          .join("<br>\n")}</p>`
    )
    .join("");
}

export default renderEmailHtml;
