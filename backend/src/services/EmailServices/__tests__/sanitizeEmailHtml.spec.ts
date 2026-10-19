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
});
