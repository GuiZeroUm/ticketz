import axios from "axios";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import GetWhatsappWbot from "../../helpers/GetWhatsappWbot";
import OutOfTicketMessage from "../../models/OutOfTicketMessages";
import { assertRuntimeCompany } from "../../helpers/tenantRuntime";

// URLs only come from authenticated SGA responses. No arbitrary URL or redirect
// can cause the backend to fetch another host (or forward the SGA token).
export const boletoUrl = (input: unknown): string => {
  try {
    const url = new URL(String(input));
    if (
      url.protocol !== "https:" ||
      url.hostname !== "short.hinova.com.br" ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/v2\/[A-Za-z0-9_-]+\.pdf$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      throw new Error();
    return url.href;
  } catch {
    throw new AppError("ERR_BILLING_PDF_URL", 502);
  }
};
export const fetchBoletoPdf = async (url: string): Promise<Buffer> => {
  try {
    const response = await axios.get(boletoUrl(url), {
      responseType: "arraybuffer",
      timeout: 30000,
      maxRedirects: 0,
      maxContentLength: 5 * 1024 * 1024,
      proxy: false,
      headers: { Accept: "application/pdf" }
    });
    const buffer = Buffer.from(response.data);
    if (
      buffer.length < 20 ||
      buffer.subarray(0, 5).toString() !== "%PDF-" ||
      !String(response.headers["content-type"])
        .toLowerCase()
        .includes("application/pdf")
    )
      throw new Error();
    return buffer;
  } catch {
    throw new AppError("ERR_BILLING_PDF", 502);
  }
};
export const sendBillingMessage = async (
  whatsapp: Whatsapp,
  number: string,
  body: string,
  pdf?: Buffer
): Promise<string> => {
  assertRuntimeCompany(whatsapp.companyId);
  if (whatsapp.status !== "CONNECTED" || !/^55\d{10,11}$/.test(number))
    throw new AppError("ERR_BILLING_CONNECTION", 409);
  const wbot = await GetWhatsappWbot(whatsapp);
  // One WhatsApp envelope: a PDF with caption, or a text. Nothing is persisted
  // under public uploads, and there is no partial PDF + text retry to duplicate.
  const message = await wbot.sendMessage(
    `${number}@s.whatsapp.net`,
    pdf
      ? {
          document: pdf,
          mimetype: "application/pdf",
          fileName: "boleto-ac-norte.pdf",
          caption: body
        }
      : { text: body, linkPreview: null }
  );
  if (!message?.key?.id) throw new AppError("ERR_BILLING_UNCERTAIN", 502);
  wbot.cacheMessage(message);
  await OutOfTicketMessage.create({
    id: message.key.id,
    dataJson: JSON.stringify(message),
    whatsappId: whatsapp.id
  });
  return message.key.id;
};

// Synthetic document for tests: never expose another member's actual boleto.
export const testPdf = (): Buffer => {
  const content =
    "BT /F1 18 Tf 50 760 Td (AC NORTE - TESTE DE ENVIO) Tj 0 -35 Td (SEM VALOR - NAO PAGAR) Tj 0 -35 Td (Documento de demonstracao. Nao e um boleto.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let result = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map(o => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
};
