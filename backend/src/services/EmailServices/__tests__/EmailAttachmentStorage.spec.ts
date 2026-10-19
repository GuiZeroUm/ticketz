import fs from "fs";
import os from "os";
import path from "path";
import uploadConfig from "../../../config/upload";
import AppError from "../../../errors/AppError";
import EmailAttachment from "../../../models/EmailAttachment";
import { MAX_ATTACHMENT_BYTES, MAX_INBOUND_ATTACHMENTS_BYTES } from "../limits";
import { NormalizedAttachment } from "../types";

const mockPrivateDir = fs.mkdtempSync(path.join(os.tmpdir(), "email-att-"));

jest.mock("../../../config/privateFiles", () => ({
  __esModule: true,
  default: { directory: mockPrivateDir }
}));

import {
  openAttachment,
  removeStoredAttachments,
  safeInlineContentType,
  saveInboundAttachments
} from "../EmailAttachmentStorage";

const att = (
  overrides: Partial<NormalizedAttachment> = {}
): NormalizedAttachment => {
  const content = overrides.content || Buffer.from("hello");
  return {
    filename: "report.pdf",
    contentType: "application/pdf",
    size: content.length,
    content,
    inline: false,
    ...overrides
  };
};

let nextId = 1;
const mockCreate = () =>
  jest.spyOn(EmailAttachment, "create").mockImplementation((async (
    values: unknown
  ) => ({
    id: nextId++,
    ...(values as object)
  })) as never);

const listFiles = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir) : [];

describe("EmailAttachmentStorage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    fs.rmSync(mockPrivateDir, { recursive: true, force: true });
  });

  it("stores files under <private>/email/<companyId>/<emailMessageId>/ with a random name, never the original filename", async () => {
    const create = mockCreate();
    const [saved] = await saveInboundAttachments(7, 42, [
      att({ filename: "secret-plan.pdf", content: Buffer.from("PDFDATA") })
    ]);

    const dir = path.join(mockPrivateDir, "email", "7", "42");
    const files = listFiles(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(files[0]).not.toContain("secret-plan");
    expect(fs.readFileSync(path.join(dir, files[0]), "utf8")).toBe("PDFDATA");

    expect(create.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        companyId: 7,
        emailMessageId: 42,
        filename: "secret-plan.pdf",
        storageKey: `email/7/42/${files[0]}`,
        skippedReason: null
      })
    );
    expect(saved.storageKey).toBe(`email/7/42/${files[0]}`);
  });

  it("the real private directory is outside the public /public mount", () => {
    const realPrivate = jest.requireActual("../../../config/privateFiles")
      .default.directory as string;
    const publicRoot = path.resolve(uploadConfig.directory);
    const privateRoot = path.resolve(realPrivate);
    expect(privateRoot).not.toBe(publicRoot);
    expect(privateRoot.startsWith(publicRoot + path.sep)).toBe(false);
    expect(publicRoot.startsWith(privateRoot + path.sep)).toBe(false);
  });

  it("sanitizes the displayed filename (separators, traversal, control chars)", async () => {
    mockCreate();
    const out = await saveInboundAttachments(7, 43, [
      att({ filename: "../../etc/pass\\wd\u0000\u0007\n.pdf" }),
      att({ filename: "  ..  " }),
      att({ filename: "‮exe.pdf" }),
      att({ filename: "a".repeat(400) + ".pdf" })
    ]);
    expect(out[0].filename).toBe("_._etc_pass_wd_.pdf");
    // eslint-disable-next-line no-control-regex
    expect(out[0].filename).not.toMatch(/[/\\\u0000-\u001f\u007f]/);
    expect(out[0].filename).not.toContain("..");
    expect(out[1].filename).toBe("anexo");
    expect(out[2].filename).not.toMatch(/[‪-‮]/);
    expect(out[3].filename.length).toBeLessThanOrEqual(255);
    expect(out[3].filename.endsWith(".pdf")).toBe(true);
    // every file on disk is still a uuid inside the company/message directory
    const dir = path.join(mockPrivateDir, "email", "7", "43");
    expect(listFiles(dir)).toHaveLength(4);
  });

  it("skips an attachment over MAX_ATTACHMENT_BYTES with skippedReason 'too_large' and stores the rest", async () => {
    mockCreate();
    const big = att({
      filename: "big.bin",
      content: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)
    });
    const small = att({ filename: "small.txt", contentType: "text/plain" });
    const out = await saveInboundAttachments(7, 44, [big, small]);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      filename: "big.bin",
      skippedReason: "too_large",
      storageKey: null
    });
    expect(out[1]).toMatchObject({
      filename: "small.txt",
      skippedReason: null
    });
    expect(out[1].storageKey).toMatch(/^email\/7\/44\//);
    expect(
      listFiles(path.join(mockPrivateDir, "email", "7", "44"))
    ).toHaveLength(1);
  });

  it("uses the real buffer length, not the declared size", async () => {
    mockCreate();
    const liar = att({
      size: 10,
      content: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)
    });
    const [out] = await saveInboundAttachments(7, 45, [liar]);
    expect(out.skippedReason).toBe("too_large");
  });

  it("skips attachments after the message total passes MAX_INBOUND_ATTACHMENTS_BYTES with 'message_too_large'", async () => {
    mockCreate();
    const chunk = Buffer.alloc(MAX_ATTACHMENT_BYTES);
    const out = await saveInboundAttachments(7, 46, [
      att({ filename: "1.bin", content: chunk }),
      att({ filename: "2.bin", content: chunk }),
      att({ filename: "3.bin", content: chunk }),
      att({ filename: "tiny.txt", content: Buffer.from("x") })
    ]);
    expect(MAX_ATTACHMENT_BYTES * 2).toBeLessThanOrEqual(
      MAX_INBOUND_ATTACHMENTS_BYTES
    );
    expect(out.map(o => o.skippedReason)).toEqual([
      null,
      null,
      "message_too_large",
      "message_too_large"
    ]);
    expect(out[2].storageKey).toBeNull();
  });

  it("does not count too_large attachments against the message total", async () => {
    mockCreate();
    const out = await saveInboundAttachments(7, 47, [
      att({ content: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1) }),
      att({ content: Buffer.alloc(MAX_ATTACHMENT_BYTES) }),
      att({ content: Buffer.alloc(MAX_ATTACHMENT_BYTES) })
    ]);
    expect(out.map(o => o.skippedReason)).toEqual(["too_large", null, null]);
  });

  it("removes the written file when the database insert fails", async () => {
    jest.spyOn(EmailAttachment, "create").mockRejectedValue(new Error("db"));
    await expect(saveInboundAttachments(7, 48, [att()])).rejects.toThrow("db");
    expect(listFiles(path.join(mockPrivateDir, "email", "7", "48"))).toEqual(
      []
    );
  });

  it("removes every file written by the call when a later create fails (no transaction)", async () => {
    let calls = 0;
    const create = jest
      .spyOn(EmailAttachment, "create")
      .mockImplementation((async (values: unknown) => {
        calls += 1;
        if (calls === 3) throw new Error("db down");
        return { id: calls, ...(values as object) };
      }) as never);
    await expect(
      saveInboundAttachments(7, 60, [att(), att(), att(), att()])
    ).rejects.toThrow("db down");
    expect(create).toHaveBeenCalledTimes(3);
    expect(listFiles(path.join(mockPrivateDir, "email", "7", "60"))).toEqual(
      []
    );
  });

  it("removes files already written when a write itself fails midway", async () => {
    mockCreate();
    const realWrite = fs.promises.writeFile;
    let writes = 0;
    jest.spyOn(fs.promises, "writeFile").mockImplementation((async (
      ...args: unknown[]
    ) => {
      writes += 1;
      if (writes === 2) {
        // leave a partial file behind, then fail
        await (realWrite as (...a: unknown[]) => Promise<void>)(
          args[0],
          "par",
          args[2]
        );
        throw new Error("ENOSPC");
      }
      return (realWrite as (...a: unknown[]) => Promise<void>)(...args);
    }) as never);
    await expect(
      saveInboundAttachments(7, 61, [att(), att(), att()])
    ).rejects.toThrow("ENOSPC");
    expect(listFiles(path.join(mockPrivateDir, "email", "7", "61"))).toEqual(
      []
    );
  });

  describe("with a transaction", () => {
    const tx = { id: "tx" } as never;

    it("passes the transaction to every EmailAttachment.create (stored and skipped)", async () => {
      const create = mockCreate();
      await saveInboundAttachments(
        7,
        62,
        [att(), att({ content: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1) })],
        { transaction: tx }
      );
      expect(create).toHaveBeenCalledTimes(2);
      create.mock.calls.forEach(call => {
        expect(call[1]).toEqual({ transaction: tx });
      });
    });

    it("omits the transaction option when none is given", async () => {
      const create = mockCreate();
      await saveInboundAttachments(7, 63, [att()]);
      expect(create.mock.calls[0][1]).toBeUndefined();
    });

    it("removes this call's files if a create fails inside the transaction", async () => {
      let calls = 0;
      jest.spyOn(EmailAttachment, "create").mockImplementation((async (
        values: unknown
      ) => {
        calls += 1;
        if (calls === 2) throw new Error("tx aborted");
        return { id: calls, ...(values as object) };
      }) as never);
      await expect(
        saveInboundAttachments(7, 64, [att(), att()], { transaction: tx })
      ).rejects.toThrow("tx aborted");
      expect(listFiles(path.join(mockPrivateDir, "email", "7", "64"))).toEqual(
        []
      );
    });

    it("keeps the files on success; the caller removes them on rollback via removeStoredAttachments", async () => {
      mockCreate();
      const saved = await saveInboundAttachments(7, 65, [att(), att()], {
        transaction: tx
      });
      const dir = path.join(mockPrivateDir, "email", "7", "65");
      expect(listFiles(dir)).toHaveLength(2);

      // Task 8's catch block after a rollback
      await removeStoredAttachments(saved.map(a => a.storageKey));
      expect(fs.existsSync(dir)).toBe(false);
    });
  });

  describe("removeStoredAttachments", () => {
    it("ignores null, malformed and escaping keys, never throws, and deletes nothing outside email/<companyId>", async () => {
      const outside = path.join(mockPrivateDir, "keep.txt");
      fs.writeFileSync(outside, "keep");
      const other = path.join(mockPrivateDir, "email", "8", "1");
      fs.mkdirSync(other, { recursive: true });
      fs.writeFileSync(path.join(other, "file"), "other");
      await expect(
        removeStoredAttachments([
          null,
          undefined,
          "",
          "../keep.txt",
          "email/7/../../keep.txt",
          "/etc/passwd",
          "email/7/1/does-not-exist"
        ])
      ).resolves.toBeUndefined();
      expect(fs.readFileSync(outside, "utf8")).toBe("keep");
      expect(fs.readFileSync(path.join(other, "file"), "utf8")).toBe("other");
    });
  });

  it("returns an empty list without touching disk for no attachments", async () => {
    const create = mockCreate();
    await expect(saveInboundAttachments(7, 49, [])).resolves.toEqual([]);
    expect(create).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(mockPrivateDir, "email", "7", "49"))).toBe(
      false
    );
  });

  describe("openAttachment", () => {
    const stored = async (companyId: number, msgId: number) => {
      mockCreate();
      const [saved] = await saveInboundAttachments(companyId, msgId, [
        att({ content: Buffer.from("content-bytes") })
      ]);
      return saved;
    };

    const readAll = async (stream: NodeJS.ReadableStream) => {
      let data = "";
      // eslint-disable-next-line no-restricted-syntax
      for await (const c of stream) data += c.toString();
      return data;
    };

    it("looks the attachment up scoped by company and streams the file", async () => {
      const saved = await stored(7, 50);
      const findOne = jest
        .spyOn(EmailAttachment, "findOne")
        .mockResolvedValue(saved as EmailAttachment);
      const { attachment, stream } = await openAttachment(7, saved.id);
      expect(findOne).toHaveBeenCalledWith({
        where: { id: saved.id, companyId: 7 }
      });
      expect(attachment.id).toBe(saved.id);
      await expect(readAll(stream)).resolves.toBe("content-bytes");
    });

    it("openAttachment of another company's attachment throws ERR_EMAIL_ATTACHMENT_NOT_FOUND", async () => {
      const saved = await stored(7, 51);
      // the company-scoped query finds nothing for company 9
      jest.spyOn(EmailAttachment, "findOne").mockResolvedValue(null);
      await expect(openAttachment(9, saved.id)).rejects.toMatchObject({
        message: "ERR_EMAIL_ATTACHMENT_NOT_FOUND",
        statusCode: 404
      });
      await expect(openAttachment(9, saved.id)).rejects.toBeInstanceOf(
        AppError
      );
    });

    it("rejects a row whose companyId differs even if the query returned it", async () => {
      const saved = await stored(7, 52);
      jest.spyOn(EmailAttachment, "findOne").mockResolvedValue(saved as never);
      await expect(openAttachment(9, saved.id)).rejects.toMatchObject({
        message: "ERR_EMAIL_ATTACHMENT_NOT_FOUND"
      });
    });

    it("throws not found for a skipped attachment (no storageKey)", async () => {
      jest.spyOn(EmailAttachment, "findOne").mockResolvedValue({
        id: 1,
        companyId: 7,
        storageKey: null,
        skippedReason: "too_large"
      } as EmailAttachment);
      await expect(openAttachment(7, 1)).rejects.toMatchObject({
        message: "ERR_EMAIL_ATTACHMENT_NOT_FOUND",
        statusCode: 404
      });
    });

    it("throws not found when the file is missing on disk", async () => {
      jest.spyOn(EmailAttachment, "findOne").mockResolvedValue({
        id: 1,
        companyId: 7,
        storageKey: "email/7/1/does-not-exist"
      } as EmailAttachment);
      await expect(openAttachment(7, 1)).rejects.toMatchObject({
        message: "ERR_EMAIL_ATTACHMENT_NOT_FOUND"
      });
    });

    it.each([
      "../../../etc/passwd",
      "email/7/../../secret",
      "email/8/1/file",
      "/etc/passwd",
      "email/7/1/..\\..\\x"
    ])(
      "refuses a storageKey that escapes the company directory: %s",
      async key => {
        fs.mkdirSync(path.join(mockPrivateDir, "email", "8", "1"), {
          recursive: true
        });
        fs.writeFileSync(
          path.join(mockPrivateDir, "email", "8", "1", "file"),
          "x"
        );
        jest.spyOn(EmailAttachment, "findOne").mockResolvedValue({
          id: 1,
          companyId: 7,
          storageKey: key
        } as EmailAttachment);
        await expect(openAttachment(7, 1)).rejects.toMatchObject({
          message: "ERR_EMAIL_ATTACHMENT_NOT_FOUND",
          statusCode: 404
        });
      }
    );
  });

  describe("safeInlineContentType", () => {
    it("safeInlineContentType('text/html') === 'application/octet-stream'", () => {
      expect(safeInlineContentType("text/html")).toBe(
        "application/octet-stream"
      );
    });

    it.each([
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "application/pdf"
    ])("keeps %s", type => {
      expect(safeInlineContentType(type)).toBe(type);
    });

    it("is case-insensitive, ignores parameters and rejects dangerous types", () => {
      expect(safeInlineContentType("IMAGE/PNG")).toBe("image/png");
      expect(safeInlineContentType("image/png; name=x")).toBe("image/png");
      expect(safeInlineContentType("image/svg+xml")).toBe(
        "application/octet-stream"
      );
      expect(safeInlineContentType("application/xhtml+xml")).toBe(
        "application/octet-stream"
      );
      expect(safeInlineContentType("")).toBe("application/octet-stream");
    });
  });
});
