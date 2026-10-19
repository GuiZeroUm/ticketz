import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "a",
  "b",
  "big",
  "blockquote",
  "br",
  "caption",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "ins",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
];

const SAFE_HREF_RE = /^(?:https?:|mailto:)/i;

export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: [
      "script",
      "style",
      "textarea",
      "option",
      "noscript",
      "iframe",
      "object",
      "title"
    ],
    transformTags: {
      a: (tagName, attribs) => {
        const href = (attribs.href || "").trim();
        if (!SAFE_HREF_RE.test(href)) {
          return { tagName: "a", attribs: {} };
        }
        return {
          tagName: "a",
          attribs: {
            href,
            target: "_blank",
            rel: "noopener noreferrer nofollow",
            ...(attribs.title ? { title: attribs.title } : {})
          }
        };
      }
    }
  });
}

export default sanitizeEmailHtml;
