import React from "react";
import { render } from "@testing-library/react";
import EmailHtmlFrame, { buildFrameDocument, estimateHtmlHeight } from ".";

describe("EmailHtmlFrame", () => {
  it("renders the html only inside a sandboxed srcdoc iframe without scripts or same-origin", () => {
    const { container } = render(
      <EmailHtmlFrame html="<p>oi</p>" title="email" />
    );
    const frame = container.querySelector("iframe");
    const tokens = frame.getAttribute("sandbox").split(/\s+/).sort();
    expect(tokens).toEqual(["allow-popups", "allow-popups-to-escape-sandbox"]);
    expect(tokens).not.toContain("allow-scripts");
    expect(tokens).not.toContain("allow-same-origin");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("srcdoc")).toContain("<p>oi</p>");
    expect(container.querySelector("p")).toBeNull();
  });

  it("blocks network loads with a CSP inside the frame document", () => {
    const doc = buildFrameDocument("<p>x</p>");
    expect(doc).toContain("Content-Security-Policy");
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain('<meta name="referrer" content="no-referrer">');
  });

  it("estimates a taller frame for longer content", () => {
    const short = estimateHtmlHeight("<p>oi</p>", 560);
    const long = estimateHtmlHeight(
      Array.from({ length: 30 }, (_, i) => `<p>linha ${i}</p>`).join(""),
      560
    );
    expect(long).toBeGreaterThan(short);
  });
});
