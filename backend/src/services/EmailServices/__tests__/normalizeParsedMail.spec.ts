import { ParsedMail, simpleParser } from "mailparser";
import normalizeParsedMail from "../normalizeParsedMail";

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
});
