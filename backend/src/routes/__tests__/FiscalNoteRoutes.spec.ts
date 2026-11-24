/* eslint-disable @typescript-eslint/no-explicit-any */
import fiscalNoteRoutes from "../fiscalNoteRoutes";
import * as FiscalNoteController from "../../controllers/FiscalNoteController";
import isBillingAdmin from "../../middleware/isBillingAdmin";
import requirePlatformSuper from "../../middleware/requirePlatformSuper";

jest.mock("../../middleware/isAuth", () => jest.fn());
jest.mock("../../middleware/isAdmin", () => jest.fn());
jest.mock("../../middleware/isBillingAdmin", () => jest.fn());
jest.mock("../../middleware/requirePlatformSuper", () => jest.fn());
jest.mock("../../controllers/FiscalNoteController", () => ({
  webhook: jest.fn(),
  settings: jest.fn(),
  showOwnFiscalData: jest.fn(),
  updateOwnFiscalData: jest.fn(),
  zipCode: jest.fn(),
  ownDocument: jest.fn(),
  showClientFiscalData: jest.fn(),
  updateClientFiscalData: jest.fn(),
  preview: jest.fn(),
  emit: jest.fn(),
  cancel: jest.fn(),
  clientDocument: jest.fn()
}));

const routeHandlers = (method: string, path: string) =>
  (fiscalNoteRoutes as any).stack
    .filter(
      (layer: any) => layer.route?.path === path && layer.route.methods[method]
    )
    .flatMap((layer: any) => layer.route.stack.map((s: any) => s.handle));

describe("fiscal note routes", () => {
  it("rate-limits the public provider webhook", () => {
    const handlers = routeHandlers("post", "/webhooks/notaas");
    // limitador antes do controlador, e nenhuma autenticação de sessão
    expect(handlers).toHaveLength(2);
    expect(handlers[1]).toBe(FiscalNoteController.webhook);
    expect(typeof handlers[0]).toBe("function");
    expect(handlers[0]).not.toBe(FiscalNoteController.webhook);
  });

  it("allows cancelling only to the platform super admin", () => {
    const cancel = routeHandlers(
      "post",
      "/billing-admin/invoices/:id/fiscal-note/cancel"
    );
    expect(cancel).toContain(isBillingAdmin);
    expect(cancel).toContain(requirePlatformSuper);
    expect(cancel.indexOf(requirePlatformSuper)).toBeLessThan(
      cancel.indexOf(FiscalNoteController.cancel)
    );
  });

  it("keeps emitting and fiscal data with the billing console", () => {
    const emit = routeHandlers(
      "post",
      "/billing-admin/invoices/:id/fiscal-note"
    );
    const fiscalData = routeHandlers(
      "put",
      "/billing-admin/clients/:companyId/fiscal-data"
    );
    expect(emit).toContain(isBillingAdmin);
    expect(emit).not.toContain(requirePlatformSuper);
    expect(fiscalData).toContain(isBillingAdmin);
    expect(fiscalData).not.toContain(requirePlatformSuper);
  });
});
