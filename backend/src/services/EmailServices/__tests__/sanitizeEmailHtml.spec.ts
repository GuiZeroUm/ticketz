import sanitizeEmailHtml from "../sanitizeEmailHtml";

describe("sanitizeEmailHtml", () => {
  it("removes scripts, handlers, javascript links, images and styles", () => {
    const out = sanitizeEmailHtml(
      '<p onclick="x()">oi</p><script>alert(1)</script><a href="javascript:x">l</a><img src="https://track.example/p.gif"><style>body{}</style>'
    );
    expect(out).toBe("<p>oi</p><a>l</a>");
  });

  it("hardens http(s) links", () => {
    expect(sanitizeEmailHtml('<a href="https://x.com">x</a>')).toBe(
      '<a href="https://x.com" target="_blank" rel="noopener noreferrer nofollow">x</a>'
    );
  });

  it("allows mailto and drops other schemes and relative links", () => {
    expect(sanitizeEmailHtml('<a href="mailto:a@x.com">m</a>')).toContain(
      'href="mailto:a@x.com"'
    );
    expect(sanitizeEmailHtml('<a href="data:text/html,x">d</a>')).toBe(
      "<a>d</a>"
    );
    expect(sanitizeEmailHtml('<a href="//evil.com/x">d</a>')).toBe("<a>d</a>");
    expect(sanitizeEmailHtml('<a href="/rel">d</a>')).toBe("<a>d</a>");
    expect(sanitizeEmailHtml('<a href=" JaVaScRiPt:alert(1)">d</a>')).toBe(
      "<a>d</a>"
    );
  });

  it("removes iframe, form, object and style attributes but keeps text and tables", () => {
    const out = sanitizeEmailHtml(
      '<form action="/x"><input name="a">texto</form><iframe src="https://e.com">fb</iframe><table style="width:1px"><tr><td colspan="2" style="color:red">c</td></tr></table>'
    );
    expect(out).not.toMatch(/form|input|iframe|style/i);
    expect(out).toContain("texto");
    expect(out).toContain('<td colspan="2">c</td>');
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeEmailHtml("")).toBe("");
  });

  it("blocks entity-obfuscated javascript: schemes", () => {
    expect(sanitizeEmailHtml('<a href="java&#x09;script:alert(1)">d</a>')).toBe(
      "<a>d</a>"
    );
    expect(sanitizeEmailHtml('<a href="&#106;avascript:alert(1)">d</a>')).toBe(
      "<a>d</a>"
    );
    expect(
      sanitizeEmailHtml('<a href="&#x6A;&#x61;vascript&colon;alert(1)">d</a>')
    ).toBe("<a>d</a>");
  });

  it("drops svg handlers and mXSS chains", () => {
    const svg = sanitizeEmailHtml('<svg onload="alert(1)"><circle/></svg>ok');
    expect(svg).not.toMatch(/svg|onload|alert|<circle/i);
    expect(svg).toContain("ok");

    const chain = sanitizeEmailHtml(
      "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>"
    );
    expect(chain).not.toMatch(/<img|onerror|<style|<math|<mglyph/i);
  });
});
