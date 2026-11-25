/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios";
import {
  cleanDescriptionText,
  DESCRIPTION_DETAIL_MAX,
  fiscalNoteDescription
} from "../FiscalNoteService";
import { lookupZipCode } from "../FiscalProfileService";

jest.mock("axios");
jest.mock("../../../models/FiscalNote", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/Invoices", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/Company", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/CompanyFiscalProfile", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/FiscalNoteWebhookDelivery", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/User", () => ({ __esModule: true, default: {} }));
jest.mock("../fiscalNoteQueue", () => ({
  enqueueFiscalNoteEmission: jest.fn()
}));
jest.mock("../../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe("NFS-e description text", () => {
  it("removes HTML, decodes escaped entities and control characters", () => {
    expect(
      cleanDescriptionText("Plano&#x2F;Pro <b>anual</b>\n&amp; suporte")
    ).toBe("Plano/Pro anual & suporte");
    expect(cleanDescriptionText("&lt;script&gt;x&lt;/script&gt; ok")).toBe(
      "x ok"
    );
    expect(cleanDescriptionText("a&#9999999999;b &#x110000; c")).toBe("a b c");
    expect(cleanDescriptionText(null)).toBe("");
  });

  it("limits the free text and keeps the fixed parts", () => {
    const description = fiscalNoteDescription({
      detail: "x".repeat(500),
      competencia: "2026-11"
    } as any);
    expect(description).toBe(
      `Licença de uso do software Espaço Whats — ${"x".repeat(
        DESCRIPTION_DETAIL_MAX
      )} — competência 11/2026`
    );
  });
});

describe("zip code lookup", () => {
  it("says not found for a well-formed zip code that does not exist", async () => {
    (axios.get as jest.Mock).mockResolvedValue({ data: { erro: true } });
    await expect(lookupZipCode("99999-999")).rejects.toMatchObject({
      message: "ERR_ZIPCODE_NOT_FOUND",
      statusCode: 404
    });
  });

  it("says invalid only for a malformed zip code, without calling the service", async () => {
    await expect(lookupZipCode("1234")).rejects.toMatchObject({
      message: "ERR_FISCAL_INVALID_ZIPCODE"
    });
    expect(axios.get).not.toHaveBeenCalled();
  });
});
