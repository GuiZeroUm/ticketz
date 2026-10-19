import renderEmailHtml from "../renderEmailHtml";

describe("renderEmailHtml", () => {
  it("escapes html and renders WhatsApp-style bold and italic", () => {
    expect(renderEmailHtml("Olá *João*\n_obrigado_ <b>")).toBe(
      "<p>Olá <strong>João</strong><br>\n<em>obrigado</em> &lt;b&gt;</p>"
    );
  });

  it("splits paragraphs on blank lines and normalizes CRLF", () => {
    expect(renderEmailHtml("a\r\n\r\nb\r\nc")).toBe("<p>a</p><p>b<br>\nc</p>");
  });

  it("does not format inside words or unmatched markers", () => {
    expect(renderEmailHtml("snake_case_name 2*3*4 *aberto")).toBe(
      "<p>snake_case_name 2*3*4 *aberto</p>"
    );
  });

  it("escapes quotes and ampersands", () => {
    expect(renderEmailHtml(`"a" & 'b'`)).toBe(
      "<p>&quot;a&quot; &amp; &#39;b&#39;</p>"
    );
  });

  it("returns empty string for blank text", () => {
    expect(renderEmailHtml("  \n ")).toBe("");
  });
});
