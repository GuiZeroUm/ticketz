import React from "react";
import { render } from "@testing-library/react";
import EmailHtmlFrame, { buildFrameDocument, estimateHtmlHeight } from ".";

describe("EmailHtmlFrame", () => {
  it("renders the html only inside a fully sandboxed srcdoc iframe", () => {
    const { container } = render(
      <EmailHtmlFrame html="<p>oi</p>" title="email" />
    );
    const frame = container.querySelector("iframe");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("srcdoc")).toContain("<p>oi</p>");
    expect(container.querySelector("p")).toBeNull();
  });

  it("blocks network loads with a CSP inside the frame document", () => {
    const doc = buildFrameDocument("<p>x</p>");
    expect(doc).toContain("Content-Security-Policy");
    expect(doc).toContain("default-src 'none'");
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
