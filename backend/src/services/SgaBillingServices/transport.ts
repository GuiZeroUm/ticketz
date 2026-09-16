import axios from "axios";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import GetWhatsappWbot from "../../helpers/GetWhatsappWbot";
import OutOfTicketMessage from "../../models/OutOfTicketMessages";
import { assertRuntimeCompany } from "../../helpers/tenantRuntime";
import normalizePhone from "../../helpers/NormalizePhone";
import { phoneKey } from "../SgaServices/normalize";
import SendMetaTemplateMessageService from "../MetaWhatsAppServices/SendMetaTemplateMessageService";
import { uploadMetaMedia } from "../MetaWhatsAppServices/SendMetaMediaMessageService";

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
export const BOLETO_FILENAME = "boleto-ac-norte.pdf";

export interface BillingOfficialDispatch {
  template: { name: string; parameters: string[] };
  document?: { id: string; filename: string };
}

// O boleto precisa estar na Meta antes do envio, e essa subida acontece fora
// daqui de proposito: o chamador marca a entrega como SENDING so depois, pra
// que uma falha de upload nao fique registrada como "talvez enviou".
export const uploadBillingDocument = async (
  whatsapp: Whatsapp,
  pdf: Buffer
): Promise<{ id: string; filename: string }> => ({
  id: await uploadMetaMedia(whatsapp, pdf, "application/pdf", BOLETO_FILENAME),
  filename: BOLETO_FILENAME
});

// Cobranca e mensagem iniciada pela empresa: fora da janela de 24h a Cloud
// API so aceita template aprovado, por isso o texto livre nao serve aqui.
const sendOfficialBillingMessage = async (
  whatsapp: Whatsapp,
  number: string,
  body: string,
  official: BillingOfficialDispatch
): Promise<string> => {
  const international = number.length <= 11 ? `55${number}` : number;
  const messageId = await SendMetaTemplateMessageService({
    whatsapp,
    to: international,
    name: official.template.name,
    parameters: official.template.parameters,
    document: official.document
  });

  // Mesmo contrato que o visibility.ts espera pra projetar a cobranca no
  // ticket: sem documentMessage o anexo perde nome e tipo na conversa.
  await OutOfTicketMessage.create({
    id: messageId,
    dataJson: JSON.stringify({
      key: { id: messageId, fromMe: true },
      wamid: messageId,
      source: "meta-cloud-api",
      message: official.document
        ? {
            documentMessage: {
              fileName: official.document.filename,
              mimetype: "application/pdf"
            }
          }
        : { conversation: body }
    }),
    whatsappId: whatsapp.id
  });

  return messageId;
};

export const sendBillingMessage = async (
  whatsapp: Whatsapp,
  number: string,
  body: string,
  pdf?: Buffer,
  official?: BillingOfficialDispatch
): Promise<string> => {
  assertRuntimeCompany(whatsapp.companyId);
  if (
    whatsapp.status !== "CONNECTED" ||
    !/^(?:\d{10,11}|55\d{10,11})$/.test(number)
  )
    throw new AppError("ERR_BILLING_CONNECTION", 409);
  if (whatsapp.apiMode === "official") {
    // Falha fechado: conexao oficial sem template resolvido nunca cai no
    // fluxo Baileys, que nao tem sessao wbot nenhuma pra essa conexao.
    if (!official) throw new AppError("ERR_BILLING_TEMPLATE_MISSING", 409);
    return sendOfficialBillingMessage(whatsapp, number, body, official);
  }
  const wbot = await GetWhatsappWbot(whatsapp);
  // A Brazilian national number is accepted as input. WhatsApp routing still
  // needs a country code, and its canonical address may omit the ninth digit.
  const international = number.length <= 11 ? `55${number}` : number;
  const address = `${normalizePhone(international).wphone}@s.whatsapp.net`;
  const registered = await wbot.onWhatsApp(address);
  const recipient = (Array.isArray(registered) ? registered : []).find(
    entry =>
      entry.exists &&
      /^55\d{10,11}@s\.whatsapp\.net$/.test(entry.jid || "") &&
      phoneKey(entry.jid.split("@")[0]) === phoneKey(international)
  );
  if (!recipient) throw new AppError("ERR_BILLING_RECIPIENT", 400);
  // One WhatsApp envelope: a PDF with caption, or a text. Nothing is persisted
  // under public uploads, and there is no partial PDF + text retry to duplicate.
  const message = await wbot.sendMessage(
    recipient.jid,
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
