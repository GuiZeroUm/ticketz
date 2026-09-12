import axios from "axios";
import {
  boletoUrl,
  fetchBoletoPdf,
  sendBillingMessage,
  testPdf
} from "../transport";
import GetWhatsappWbot from "../../../helpers/GetWhatsappWbot";
import OutOfTicketMessage from "../../../models/OutOfTicketMessages";
jest.mock("axios");
jest.mock("../../../helpers/GetWhatsappWbot", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../../models/OutOfTicketMessages", () => ({
  __esModule: true,
  default: { create: jest.fn() }
}));
const get = axios.get as jest.Mock;
const wbot = { sendMessage: jest.fn(), cacheMessage: jest.fn() };
beforeEach(() => {
  jest.resetAllMocks();
  (GetWhatsappWbot as jest.Mock).mockResolvedValue(wbot);
  wbot.sendMessage.mockResolvedValue({ key: { id: "wamid.test" } });
});
it.each([
  "http://short.hinova.com.br/v2/a.pdf",
  "https://evil.test/a.pdf",
  "https://short.hinova.com.br.evil.test/v2/a.pdf",
  "https://short.hinova.com.br@127.0.0.1/v2/a.pdf",
  "https://short.hinova.com.br:8443/v2/a.pdf",
  "https://short.hinova.com.br/v2/a.pdf?redirect=http://127.0.0.1",
  "file:///etc/passwd",
  "https://short.hinova.com.br/v2/a.html"
])("rejects untrusted PDF URL %s", url =>
  expect(() => boletoUrl(url)).toThrow()
);
it("downloads only PDFs from the verified host without token or redirects", async () => {
  const pdf = testPdf();
  get.mockResolvedValue({
    data: pdf,
    headers: { "content-type": "application/pdf" }
  });
  expect(await fetchBoletoPdf("https://short.hinova.com.br/v2/a.pdf")).toEqual(
    pdf
  );
  expect(get).toHaveBeenCalledWith(
    "https://short.hinova.com.br/v2/a.pdf",
    expect.objectContaining({
      maxRedirects: 0,
      maxContentLength: 5242880,
      headers: { Accept: "application/pdf" }
    })
  );
});
it.each([
  {
    data: "<html>error</html>",
    headers: { "content-type": "application/pdf" }
  },
  { data: testPdf(), headers: { "content-type": "text/html" } }
])("rejects HTML pretending to be a boleto", async response => {
  get.mockResolvedValue(response);
  await expect(
    fetchBoletoPdf("https://short.hinova.com.br/v2/a.pdf")
  ).rejects.toMatchObject({ message: "ERR_BILLING_PDF" });
});
it("sends exactly one PDF envelope with caption and no public file", async () => {
  expect(
    await sendBillingMessage(
      { id: 10, companyId: 9, status: "CONNECTED" } as never,
      "5568992081954",
      "Olá Guilherme",
      testPdf()
    )
  ).toBe("wamid.test");
  expect(wbot.sendMessage).toHaveBeenCalledTimes(1);
  expect(wbot.sendMessage).toHaveBeenCalledWith(
    "5568992081954@s.whatsapp.net",
    expect.objectContaining({
      document: expect.any(Buffer),
      caption: "Olá Guilherme",
      mimetype: "application/pdf"
    })
  );
  expect(OutOfTicketMessage.create).toHaveBeenCalledTimes(1);
});
it("sends text only on other stages", async () => {
  await sendBillingMessage(
    { id: 10, companyId: 9, status: "CONNECTED" } as never,
    "5568992081954",
    "Lembrete"
  );
  expect(wbot.sendMessage).toHaveBeenCalledWith(
    "5568992081954@s.whatsapp.net",
    { text: "Lembrete", linkPreview: null }
  );
});
it("rejects disconnected sessions and group destinations", async () => {
  await expect(
    sendBillingMessage(
      { id: 10, companyId: 9, status: "DISCONNECTED" } as never,
      "5568992081954",
      "body"
    )
  ).rejects.toMatchObject({ message: "ERR_BILLING_CONNECTION" });
  await expect(
    sendBillingMessage(
      { id: 10, companyId: 9, status: "CONNECTED" } as never,
      "123@g.us",
      "body"
    )
  ).rejects.toMatchObject({ message: "ERR_BILLING_CONNECTION" });
  expect(wbot.sendMessage).not.toHaveBeenCalled();
});
it("rejects runtime ownership mismatch", async () => {
  process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS = "9";
  try {
    await expect(
      sendBillingMessage(
        { id: 10, companyId: 9, status: "CONNECTED" } as never,
        "5568992081954",
        "body"
      )
    ).rejects.toMatchObject({ message: "ERR_FORBIDDEN" });
    expect(wbot.sendMessage).not.toHaveBeenCalled();
  } finally {
    delete process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS;
  }
});
it("creates a structurally complete synthetic PDF explicitly marked invalid for payment", () => {
  const pdf = testPdf().toString();
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf).toContain("SEM VALOR - NAO PAGAR");
  expect(pdf).toContain("xref\n0 6");
  expect(pdf.trim().endsWith("%%EOF")).toBe(true);
});
