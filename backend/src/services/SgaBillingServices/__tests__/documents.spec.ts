import { promises as fs } from "fs";
import path from "path";

const mockDirectory = "/tmp/ticketz-billing-documents-tests";

jest.mock("../../../config/privateFiles", () => ({
  __esModule: true,
  default: { directory: mockDirectory }
}));

import { readBillingPdf, storeBillingPdf } from "../documents";

const pdfFixture = () => Buffer.from(`%PDF-1.4\n${"x".repeat(32)}\n%%EOF`);

beforeEach(async () => {
  await fs.rm(mockDirectory, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(mockDirectory, { recursive: true, force: true });
});

it("stores and reads a boleto only inside the private tenant directory", async () => {
  const pdf = pdfFixture();
  const storedPath = await storeBillingPdf(9, "332", pdf);

  expect(storedPath).toBe("billing/9/332.pdf");
  expect(await readBillingPdf(storedPath)).toEqual(pdf);
  const stat = await fs.stat(path.join(mockDirectory, storedPath));
  expect(stat.mode & 0o777).toBe(0o600);
});

it("rejects unsafe identifiers and non-PDF content", async () => {
  await expect(
    storeBillingPdf(9, "../332", pdfFixture())
  ).rejects.toMatchObject({ message: "ERR_BILLING_PDF" });
  await expect(
    storeBillingPdf(9, "332", Buffer.from("not a pdf"))
  ).rejects.toMatchObject({ message: "ERR_BILLING_PDF" });
  await expect(readBillingPdf("../../etc/passwd")).rejects.toMatchObject({
    message: "ERR_BILLING_PDF"
  });
});
