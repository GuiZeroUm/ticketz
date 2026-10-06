import supplierReadOnly from "../../middleware/supplierReadOnly";
import AppError from "../../errors/AppError";

const request = (method: string, path: string) => ({ method, path }) as never;

describe("supplier read-only boundary", () => {
  const original = process.env.ACNORTE_SUPPLIER_SSO_ROLE;
  afterEach(() => {
    if (original === undefined) delete process.env.ACNORTE_SUPPLIER_SSO_ROLE;
    else process.env.ACNORTE_SUPPLIER_SSO_ROLE = original;
  });

  it("blocks sending and ticket changes even when a caller knows the API path", () => {
    process.env.ACNORTE_SUPPLIER_SSO_ROLE = "target";
    const next = jest.fn();
    expect(() =>
      supplierReadOnly(request("POST", "/messages/10"), {} as never, next)
    ).toThrow(AppError);
    expect(() =>
      supplierReadOnly(request("PUT", "/tickets/10"), {} as never, next)
    ).toThrow(AppError);
    expect(() =>
      supplierReadOnly(request("POST", "/campaigns"), {} as never, next)
    ).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows viewing, SSO exchange and QR connection setup", () => {
    process.env.ACNORTE_SUPPLIER_SSO_ROLE = "target";
    const next = jest.fn();
    supplierReadOnly(request("GET", "/messages/10"), {} as never, next);
    supplierReadOnly(
      request("POST", "/auth/fornecedores/trocar"),
      {} as never,
      next
    );
    supplierReadOnly(request("POST", "/whatsapp/"), {} as never, next);
    supplierReadOnly(
      request("POST", "/whatsappsession/1/capture-token"),
      {} as never,
      next
    );
    expect(next).toHaveBeenCalledTimes(4);
  });

  it("does not alter the ACNorte source runtime", () => {
    process.env.ACNORTE_SUPPLIER_SSO_ROLE = "source";
    const next = jest.fn();
    supplierReadOnly(request("POST", "/messages/10"), {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
