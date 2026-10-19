import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

// Email HTML (already sanitized by the backend) is only ever rendered inside
// this frame: sandbox="" gives it an opaque origin with no scripts, forms,
// popups or navigation, and the CSP below blocks every network load as a
// second line of defense (no tracking pixels, fonts or stylesheets).
const FRAME_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

const MIN_HEIGHT = 40;
const MAX_HEIGHT = 1600;
const LINE_HEIGHT = 20;
const CHAR_WIDTH = 7;
const DEFAULT_WIDTH = 560;
const BLOCK_SELECTOR =
  "p,div,li,tr,h1,h2,h3,h4,h5,h6,blockquote,pre,table,hr,section,article";

const clamp = value =>
  Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(value)));

export const buildFrameDocument = html =>
  "<!doctype html><html><head>" +
  '<meta charset="utf-8">' +
  `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">` +
  "<style>" +
  "html,body{margin:0;padding:0;background:transparent;}" +
  "body{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;" +
  "font-size:13px;line-height:1.55;color:#1D1D1F;overflow-wrap:anywhere;}" +
  "img{max-width:100%;height:auto;}table{max-width:100%;}" +
  "pre{white-space:pre-wrap;}p{margin:0 0 10px;}" +
  "blockquote{margin:0 0 10px 4px;padding-left:10px;" +
  "border-left:2px solid #E4E4E7;color:#63636B;}" +
  "a{color:#024BF4;}" +
  "</style></head><body>" +
  (html || "") +
  "</body></html>";

// The sandboxed document has an opaque origin, so the parent usually cannot
// read its height. The HTML is parsed inertly (DOMParser runs no scripts and
// loads nothing) to estimate how many lines it needs at the frame width.
export const estimateHtmlHeight = (html, width = DEFAULT_WIDTH) => {
  if (typeof DOMParser === "undefined") return 200;
  try {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    doc.querySelectorAll("br").forEach(node => node.replaceWith("\n"));
    doc.querySelectorAll(BLOCK_SELECTOR).forEach(node => node.append("\n"));
    const perLine = Math.max(
      20,
      Math.floor((width || DEFAULT_WIDTH) / CHAR_WIDTH)
    );
    const lines = (doc.body?.textContent || "")
      .split("\n")
      .reduce((total, line) => {
        const length = line.trim().length;
        return total + (length ? Math.ceil(length / perLine) : 0.5);
      }, 0);
    const images = doc.images ? doc.images.length * 160 : 0;
    return clamp(lines * LINE_HEIGHT + images + 8);
  } catch (_) {
    return 200;
  }
};

const EmailHtmlFrame = ({ html, title, className, style }) => {
  const frameRef = useRef(null);
  const [height, setHeight] = useState(() => estimateHtmlHeight(html));
  const srcDoc = useMemo(() => buildFrameDocument(html), [html]);

  useEffect(() => {
    setHeight(estimateHtmlHeight(html, frameRef.current?.clientWidth));
  }, [html]);

  const handleLoad = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let measured = 0;
    try {
      // Only readable if a browser ever grants access; normally throws/null.
      measured = frame.contentDocument?.documentElement?.scrollHeight || 0;
    } catch (_) {
      measured = 0;
    }
    setHeight(
      measured ? clamp(measured) : estimateHtmlHeight(html, frame.clientWidth)
    );
  }, [html]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      sandbox=""
      srcDoc={srcDoc}
      referrerPolicy="no-referrer"
      onLoad={handleLoad}
      className={className}
      style={{
        display: "block",
        width: "100%",
        height,
        border: 0,
        background: "transparent",
        ...style
      }}
    />
  );
};

export default EmailHtmlFrame;
