import { createHash } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import extractHelpImages from "../extractHelpImages";

jest.mock("../../config/upload", () => ({
  __esModule: true,
  default: { directory: "/unused" }
}));

const sha256Hex = (content: string) =>
  createHash("sha256").update(content).digest("hex");

const png = Buffer.from("fake-png").toString("base64");
const img = `<p><img src="data:image/png;base64,${png}" alt="a"></p>`;

describe("extractHelpImages", () => {
  let dir: string;
  let fileNotDir: string;
  const previousBackendUrl = process.env.BACKEND_URL;

  beforeEach(async () => {
    process.env.BACKEND_URL = "https://api.test/backend";
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "help-images-"));
    dir = path.join(base, "help");
    await fs.mkdir(dir);
    fileNotDir = path.join(base, "file");
    await fs.writeFile(fileNotDir, "x");
  });

  afterEach(async () => {
    process.env.BACKEND_URL = previousBackendUrl;
    await fs.rm(path.dirname(dir), { recursive: true, force: true });
  });

  it("writes the image and rewrites the src", async () => {
    const out = await extractHelpImages(img, dir);
    const name = `${sha256Hex("fake-png")}.png`;

    expect(out).toBe(
      `<p><img src="https://api.test/backend/public/help/${name}" alt="a"></p>`
    );
    expect((await fs.readFile(path.join(dir, name))).toString()).toBe(
      "fake-png"
    );
  });

  it("reuses one file for a repeated image", async () => {
    const out = await extractHelpImages(img + img, dir);

    expect(out).not.toContain("data:image");
    expect(await fs.readdir(dir)).toHaveLength(1);
  });

  it("is idempotent", async () => {
    const once = await extractHelpImages(img, dir);

    expect(await extractHelpImages(once, dir)).toBe(once);
  });

  it("leaves svg untouched", async () => {
    const svg = `<img src="data:image/svg+xml;base64,${png}">`;

    expect(await extractHelpImages(svg, dir)).toBe(svg);
  });

  it("keeps an image whose base64 is invalid", async () => {
    const bad = `<img src="data:image/png;base64,@@@">`;

    expect(await extractHelpImages(bad, dir)).toBe(bad);
    expect(await fs.readdir(dir)).toHaveLength(0);
  });

  it("propagates a write failure", async () => {
    await expect(
      extractHelpImages(img, path.join(fileNotDir, "x"))
    ).rejects.toThrow();
  });

  it("uses the extension of each supported type", async () => {
    const html = ["jpeg", "gif", "webp"]
      .map(type => `<img src="data:image/${type};base64,${png}">`)
      .join("");

    const out = await extractHelpImages(html, dir);

    ["jpeg", "gif", "webp"].forEach(ext =>
      expect(out).toContain(
        `${sha256Hex("fake-png")}.${ext === "jpeg" ? "jpg" : ext}"`
      )
    );
    expect(await fs.readdir(dir)).toHaveLength(3);
  });

  it("keeps an image whose base64 has non-canonical content", async () => {
    // "QUI=" is the canonical form of "AB"; "QUJ" has stray trailing bits
    const bad = `<img src="data:image/png;base64,QUJ">`;

    expect(await extractHelpImages(bad, dir)).toBe(bad);
    expect(await fs.readdir(dir)).toHaveLength(0);
  });

  it("leaves no temporary files behind", async () => {
    await extractHelpImages(img, dir);

    const files = await fs.readdir(dir);
    expect(files.every(file => !file.endsWith(".tmp"))).toBe(true);
  });
});
