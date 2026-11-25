/* eslint-disable @typescript-eslint/no-explicit-any */
import { isValidCnpj, isValidCpf, isValidZipCode } from "../fiscalValidation";
import {
  isFiscalProfileComplete,
  normalizeFiscalProfileInput,
  serializeFiscalProfile
} from "../FiscalProfileService";
import { completeProfile } from "./fiscalTestUtils";

jest.mock("../../../models/Company", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/CompanyFiscalProfile", () => ({
  __esModule: true,
  default: {}
}));

describe("fiscal data validation", () => {
  it("checks CPF and CNPJ verification digits", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  it("checks the zip code format", () => {
    expect(isValidZipCode("01001-000")).toBe(true);
    expect(isValidZipCode("0100100")).toBe(false);
  });

  it("rejects a document that does not match its type", () => {
    expect(() =>
      normalizeFiscalProfileInput({
        documentType: "cpf",
        document: "11222333000181"
      })
    ).toThrow(
      expect.objectContaining({ message: "ERR_FISCAL_INVALID_DOCUMENT" })
    );
  });

  it("rejects invalid email, zip code and state", () => {
    expect(() => normalizeFiscalProfileInput({ email: "x@" })).toThrow(
      expect.objectContaining({ message: "ERR_FISCAL_INVALID_EMAIL" })
    );
    expect(() =>
      normalizeFiscalProfileInput({ address: { zipCode: "123" } })
    ).toThrow(
      expect.objectContaining({ message: "ERR_FISCAL_INVALID_ZIPCODE" })
    );
    expect(() =>
      normalizeFiscalProfileInput({ address: { state: "XX" } })
    ).toThrow(expect.objectContaining({ message: "ERR_FISCAL_INVALID_STATE" }));
  });

  it("accepts partial data and normalizes digits and state", () => {
    const data = normalizeFiscalProfileInput({
      documentType: "cnpj",
      document: "11.222.333/0001-81",
      address: { zipCode: "01001-000", state: "sp" }
    });
    expect(data.document).toBe("11222333000181");
    expect(data.zipCode).toBe("01001000");
    expect(data.state).toBe("SP");
    expect(isFiscalProfileComplete(data)).toBe(false);
  });

  it("is complete only with every field the NFS-e needs", () => {
    expect(isFiscalProfileComplete(completeProfile() as any)).toBe(true);
    expect(
      isFiscalProfileComplete(completeProfile({ number: "" }) as any)
    ).toBe(false);
    expect(serializeFiscalProfile(completeProfile() as any).complete).toBe(
      true
    );
    expect(serializeFiscalProfile(null).complete).toBe(false);
  });
});
