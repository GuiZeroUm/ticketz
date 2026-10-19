import { ParsedMail, simpleParser } from "mailparser";
import normalizeParsedMail from "../normalizeParsedMail";
import { MAX_HTML_BYTES } from "../limits";

const meta = {
  accountId: 7,
  direction: "in" as const,
  providerMessageId: "INBOX:1:42"
};

const addr = (...values: { address: string; name?: string }[]) => ({
  value: values,
  html: "",
  text: ""
});

const build = (over: Record<string, unknown>): ParsedMail =>
  ({
    headers: new Map(),
    attachments: [],
    ...over
  }) as unknown as ParsedMail;

describe("normalizeParsedMail", () => {
  it("uses text part, falls back to html-to-text when text is empty, and sanitizes html", () => {
    const withText = normalizeParsedMail(
      build({
        from: addr({ address: "Carla@X.com", name: "Carla" }),
        to: addr({ address: "Loja@Y.com", name: "" }),
        subject: "Oi",
        text: "texto simples\r\n",
        html: '<p onclick="x()">html</p><script>1</script>',
        date: new Date("2026-10-19T10:00:00Z")
      }),
      { ...meta, providerThreadId: "t1", flags: ["seen"] }
    );
    expect(withText).toMatchObject({
      accountId: 7,
      direction: "in",
      providerMessageId: "INBOX:1:42",
      providerThreadId: "t1",
      from: { address: "carla@x.com", name: "Carla" },
      to: [{ address: "loja@y.com" }],
      cc: [],
      replyTo: [],
      subject: "Oi",
      text: "texto simples",
      htmlSanitized: "<p>html</p>",
      flags: ["seen"],
      references: []
    });
    expect(withText.receivedAt).toEqual(new Date("2026-10-19T10:00:00Z"));

    const htmlOnly = normalizeParsedMail(
      build({
        from: addr({ address: "a@x.com" }),
        text: "  ",
        html: '<p>Olá <b>mundo</b></p><img src="https://t/p.gif"><p>fim</p>'
      }),
      meta
    );
    expect(htmlOnly.text).toContain("Olá mundo");
    expect(htmlOnly.text).toContain("fim");
    expect(htmlOnly.text).not.toContain("<");
    expect(htmlOnly.text).not.toContain("p.gif");
  });

  it("maps inReplyTo, references array and Message-ID from headers", () => {
    const out = normalizeParsedMail(
      build({
        from: addr({ address: "a@x.com" }),
        messageId: "<m1@x.com>",
        inReplyTo: "<p@x.com>",
        references: ["<r1@x.com>", "<p@x.com>"],
        replyTo: addr({ address: "Reply@X.com" }),
        cc: [addr({ address: "c1@x.com" }), addr({ address: "c2@x.com" })]
      }),
      meta
    );
    expect(out.internetMessageId).toBe("<m1@x.com>");
    expect(out.inReplyTo).toBe("<p@x.com>");
    expect(out.references).toEqual(["<r1@x.com>", "<p@x.com>"]);
    expect(out.replyTo).toEqual([{ address: "reply@x.com" }]);
    expect(out.cc).toEqual([{ address: "c1@x.com" }, { address: "c2@x.com" }]);

    const single = normalizeParsedMail(
      build({
        from: addr({ address: "a@x.com" }),
        references: "<a@x> <b@x>"
      }),
      meta
    );
    expect(single.references).toEqual(["<a@x>", "<b@x>"]);
  });

  it("maps attachments and flags inline images with a content id", () => {
    const out = normalizeParsedMail(
      build({
        from: addr({ address: "a@x.com" }),
        attachments: [
          {
            filename: "a.pdf",
            contentType: "application/pdf",
            size: 3,
            content: Buffer.from("pdf"),
            contentDisposition: "inline"
          },
          {
            contentType: "image/png",
            content: Buffer.from("png!"),
            contentDisposition: "inline",
            related: true,
            cid: "logo1",
            contentId: "<logo1>"
          }
        ]
      }),
      meta
    );
    expect(out.attachments).toHaveLength(2);
    expect(out.attachments[0]).toMatchObject({
      filename: "a.pdf",
      size: 3,
      inline: false
    });
    expect(out.attachments[1]).toMatchObject({
      contentType: "image/png",
      size: 4,
      inline: true,
      contentId: "logo1"
    });
    expect(out.attachments[1].filename).toMatch(/\.png$/);
  });

  it("detects a delivery-status report and sets bounceOf from the embedded message's Message-ID", async () => {
    const raw = [
      "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      "To: loja@y.com",
      "Subject: Delivery Status Notification (Failure)",
      "Message-ID: <bounce1@googlemail.com>",
      "Date: Mon, 19 Oct 2026 10:00:00 +0000",
      "MIME-Version: 1.0",
      'Content-Type: multipart/report; report-type=delivery-status; boundary="b1"',
      "",
      "--b1",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Address not found.",
      "",
      "--b1",
      "Content-Type: message/delivery-status",
      "",
      "Reporting-MTA: dns; googlemail.com",
      "",
      "Final-Recipient: rfc822; nobody@example.com",
      "Action: failed",
      "Status: 5.1.1",
      "",
      "--b1",
      "Content-Type: message/rfc822",
      "",
      "From: loja@y.com",
      "To: nobody@example.com",
      "Subject: Proposta",
      "Message-ID: <orig-123@y.com>",
      "",
      "corpo original",
      "",
      "--b1--",
      ""
    ].join("\r\n");
    const parsed = await simpleParser(Buffer.from(raw));
    const out = normalizeParsedMail(parsed, meta);
    expect(out.flags).toContain("bounce");
    expect(out.bounceOf).toBe("<orig-123@y.com>");
    expect(out.internetMessageId).toBe("<bounce1@googlemail.com>");
  });

  it("flags mailer-daemon senders as bounce and falls back to inReplyTo", () => {
    const out = normalizeParsedMail(
      build({
        from: addr({ address: "MAILER-DAEMON@mx.example.com" }),
        inReplyTo: "<orig@y.com>",
        text: "failure"
      }),
      { ...meta, flags: ["bounce"] }
    );
    expect(out.flags.filter(f => f === "bounce")).toHaveLength(1);
    expect(out.bounceOf).toBe("<orig@y.com>");

    const postmaster = normalizeParsedMail(
      build({ from: addr({ address: "postmaster@x.com" }) }),
      meta
    );
    expect(postmaster.flags).toContain("bounce");
    expect(postmaster.bounceOf).toBeUndefined();
  });

  it("does not flag ordinary mail as bounce", () => {
    const out = normalizeParsedMail(
      build({ from: addr({ address: "a@x.com" }), text: "oi" }),
      meta
    );
    expect(out.flags).toEqual([]);
    expect(out.bounceOf).toBeUndefined();
  });

  it("keeps IDN senders in ASCII form (punycode From through mailparser)", async () => {
    const raw = [
      "From: =?UTF-8?Q?Jo=C3=A3o?= <joao@xn--po-sia.com.br>",
      "To: loja@y.com",
      "Subject: oi",
      "",
      "corpo",
      ""
    ].join("\r\n");
    const out = normalizeParsedMail(await simpleParser(Buffer.from(raw)), meta);
    expect(out.from.address).toBe("joao@xn--po-sia.com.br");
    expect(out.from.name).toBe("João");

    const unicode = normalizeParsedMail(
      build({ from: addr({ address: "Joao@Pão.com.br" }) }),
      meta
    );
    expect(unicode.from.address).toBe("joao@xn--po-sia.com.br");
  });

  it("yields an empty from.address when From is missing or unparseable", async () => {
    expect(normalizeParsedMail(build({ text: "oi" }), meta).from).toEqual({
      address: ""
    });
    expect(
      normalizeParsedMail(build({ from: addr({ address: "garbage" }) }), meta)
        .from.address
    ).toBe("");
    const parsed = await simpleParser(
      Buffer.from("To: loja@y.com\r\nSubject: sem from\r\n\r\ncorpo\r\n")
    );
    expect(normalizeParsedMail(parsed, meta).from.address).toBe("");
  });

  it("reduces In-Reply-To and References to <id> tokens", () => {
    const multi = normalizeParsedMail(
      build({
        from: addr({ address: "a@x.com" }),
        inReplyTo: "<b@x> <c@x>",
        references: ["<r1@x>, <r2@x>", "<r3@x>"]
      }),
      meta
    );
    expect(multi.inReplyTo).toBe("<b@x>");
    expect(multi.references).toEqual(["<r1@x>", "<r2@x>", "<r3@x>"]);

    const legacy = normalizeParsedMail(
      build({
        from: addr({ address: "a@x.com" }),
        inReplyTo: "Your message of Mon, 19 Oct 2026 <b@x>",
        references: "<a@x>,<b@x>"
      }),
      meta
    );
    expect(legacy.inReplyTo).toBe("<b@x>");
    expect(legacy.references).toEqual(["<a@x>", "<b@x>"]);

    const none = normalizeParsedMail(
      build({ from: addr({ address: "a@x.com" }), inReplyTo: "garbage" }),
      meta
    );
    expect(none.inReplyTo).toBeUndefined();
  });

  it("applies the token reduction to bounceOf fallback", () => {
    const out = normalizeParsedMail(
      build({
        from: addr({ address: "mailer-daemon@x.com" }),
        inReplyTo: "re: <orig@y.com> <other@y.com>"
      }),
      meta
    );
    expect(out.bounceOf).toBe("<orig@y.com>");
  });

  it("skips sanitizing oversized html and truncates the html-to-text input", () => {
    const big = `<p>início</p>${"<p>x</p>".repeat(MAX_HTML_BYTES / 8 + 10)}<p>FIM-FORA</p>`;
    expect(big.length).toBeGreaterThan(MAX_HTML_BYTES);
    const out = normalizeParsedMail(
      build({ from: addr({ address: "a@x.com" }), html: big }),
      meta
    );
    expect(out.htmlSanitized).toBeUndefined();
    expect(out.text).toContain("início");
    expect(out.text).not.toContain("FIM-FORA");

    const withText = normalizeParsedMail(
      build({ from: addr({ address: "a@x.com" }), html: big, text: "plain" }),
      meta
    );
    expect(withText.text).toBe("plain");
    expect(withText.htmlSanitized).toBeUndefined();
  });
});
