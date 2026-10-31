import Help from "../../models/Help";
import extractHelpImages from "../../helpers/extractHelpImages";
import { runExtractHelpImages } from "../ExtractHelpImages";

jest.mock("../../database", () => ({
  __esModule: true,
  default: { close: jest.fn() }
}));

jest.mock("../../models/Help", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));

jest.mock("../../helpers/extractHelpImages", () => ({
  __esModule: true,
  default: jest.fn()
}));

const row = (id: number, content: string) => ({
  id,
  content,
  update: jest.fn().mockResolvedValue(undefined)
});

describe("runExtractHelpImages", () => {
  const inlineContent = '<img src="data:image/png;base64,AAAA">';
  const extractedContent = '<img src="https://api.test/public/help/x.png">';

  beforeEach(() => {
    (extractHelpImages as jest.Mock).mockImplementation(async (html: string) =>
      html === inlineContent ? extractedContent : html
    );
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("updates only rows that still hold inline images", async () => {
    const inlineRow = row(1, inlineContent);
    const cleanRow = row(2, "<p>no images</p>");
    (Help.findAll as jest.Mock).mockResolvedValue([inlineRow, cleanRow]);

    const result = await runExtractHelpImages({ dryRun: false });

    expect(Help.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: ["id", "content"] })
    );
    expect(inlineRow.update).toHaveBeenCalledTimes(1);
    expect(inlineRow.update).toHaveBeenCalledWith({
      content: extractedContent
    });
    expect(cleanRow.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 2,
      changed: 1,
      bytesBefore:
        Buffer.byteLength(inlineContent) +
        Buffer.byteLength("<p>no images</p>"),
      bytesAfter:
        Buffer.byteLength(extractedContent) +
        Buffer.byteLength("<p>no images</p>")
    });
  });

  it("writes nothing on dry run", async () => {
    const inlineRow = row(1, inlineContent);
    (Help.findAll as jest.Mock).mockResolvedValue([inlineRow]);

    const result = await runExtractHelpImages({ dryRun: true });

    expect(inlineRow.update).not.toHaveBeenCalled();
    expect(extractHelpImages).not.toHaveBeenCalled();
    expect(result).toMatchObject({ scanned: 1, changed: 0 });
  });

  it("does not update when nothing could be extracted", async () => {
    const svgContent = '<img src="data:image/svg+xml;base64,AAAA">';
    const svgRow = row(3, svgContent);
    (Help.findAll as jest.Mock).mockResolvedValue([svgRow]);

    const result = await runExtractHelpImages({ dryRun: false });

    expect(extractHelpImages).toHaveBeenCalledTimes(1);
    expect(svgRow.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 1,
      changed: 0,
      bytesBefore: Buffer.byteLength(svgContent),
      bytesAfter: Buffer.byteLength(svgContent)
    });
  });

  it("stops without touching later rows when extraction fails", async () => {
    const first = row(1, inlineContent);
    const second = row(2, inlineContent);
    (Help.findAll as jest.Mock).mockResolvedValue([first, second]);
    (extractHelpImages as jest.Mock).mockRejectedValueOnce(new Error("disk"));

    await expect(runExtractHelpImages({ dryRun: false })).rejects.toThrow(
      "disk"
    );

    expect(first.update).not.toHaveBeenCalled();
    expect(second.update).not.toHaveBeenCalled();
  });
});
