import {
  getPlatformCompanyId,
  isPlatformSuper
} from "../../helpers/platformSuper";

describe("isPlatformSuper", () => {
  const original = process.env.MASTER_COMPANY_ID;

  afterEach(() => {
    if (original === undefined) delete process.env.MASTER_COMPANY_ID;
    else process.env.MASTER_COMPANY_ID = original;
  });

  it("usa a empresa 1 quando MASTER_COMPANY_ID nao esta definida", () => {
    delete process.env.MASTER_COMPANY_ID;
    expect(getPlatformCompanyId()).toBe(1);
  });

  it("aceita o super da empresa master", () => {
    delete process.env.MASTER_COMPANY_ID;
    expect(isPlatformSuper({ super: true, companyId: 1 })).toBe(true);
  });

  it("recusa usuario super de outra empresa", () => {
    delete process.env.MASTER_COMPANY_ID;
    expect(isPlatformSuper({ super: true, companyId: 7 })).toBe(false);
  });

  it("recusa usuario comum da empresa master", () => {
    delete process.env.MASTER_COMPANY_ID;
    expect(isPlatformSuper({ super: false, companyId: 1 })).toBe(false);
    expect(isPlatformSuper(null)).toBe(false);
  });

  it("respeita MASTER_COMPANY_ID configurada", () => {
    process.env.MASTER_COMPANY_ID = "5";
    expect(isPlatformSuper({ super: true, companyId: 5 })).toBe(true);
    expect(isPlatformSuper({ super: true, companyId: 1 })).toBe(false);
  });
});
