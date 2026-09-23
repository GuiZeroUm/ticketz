import { promises as fs } from "fs";
import path from "path";
import privateFiles from "../../config/privateFiles";
import AppError from "../../errors/AppError";

const safePart = (value: string | number): string => {
  const part = String(value);
  if (!/^\d+$/.test(part)) throw new AppError("ERR_BILLING_PDF", 400);
  return part;
};

const resolveStoredPath = (storedPath: string): string => {
  const relative = storedPath.replace(/\\/g, "/");
  if (
    relative.startsWith("/") ||
    relative.split("/").some(part => !part || part === "." || part === "..")
  ) {
    throw new AppError("ERR_BILLING_PDF", 404);
  }
  const root = path.resolve(privateFiles.directory);
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw new AppError("ERR_BILLING_PDF", 404);
  }
  return absolute;
};

export const storeBillingPdf = async (
  companyId: number,
  deliveryId: string | number,
  pdf: Buffer
): Promise<string> => {
  if (
    pdf.length < 20 ||
    pdf.subarray(0, 5).toString() !== "%PDF-" ||
    pdf.length > 5 * 1024 * 1024
  ) {
    throw new AppError("ERR_BILLING_PDF", 502);
  }

  const relative = path.posix.join(
    "billing",
    safePart(companyId),
    `${safePart(deliveryId)}.pdf`
  );
  const absolute = resolveStoredPath(relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
  const temporary = `${absolute}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, Uint8Array.from(pdf), {
      mode: 0o600,
      flag: "wx"
    });
    await fs.rename(temporary, absolute);
    await fs.chmod(absolute, 0o600);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
  return relative;
};

export const readBillingPdf = async (storedPath: string): Promise<Buffer> => {
  try {
    const pdf = await fs.readFile(resolveStoredPath(storedPath));
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error();
    return pdf;
  } catch {
    throw new AppError("ERR_BILLING_PDF", 404);
  }
};
