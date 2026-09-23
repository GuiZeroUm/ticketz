import isAdmin from "../../middleware/isAdmin";
import sgaRoutes from "../sgaRoutes";

jest.mock("../../middleware/isAuth", () => jest.fn());
jest.mock("../../middleware/isAdmin", () => jest.fn());
jest.mock("../../services/SgaServices/service", () => ({
  assertSgaTenant: jest.fn(),
  sgaEnabled: jest.fn(),
  snapshot: jest.fn(),
  syncSga: jest.fn(),
  listSga: jest.fn(),
  loadSga: jest.fn(),
  setSgaLink: jest.fn()
}));
jest.mock("../../services/SgaServices/client", () => ({
  sgaRequest: jest.fn()
}));
jest.mock("../../services/SgaServices/normalize", () => ({
  text: jest.fn(),
  isOverdue: jest.fn()
}));
jest.mock("../../services/SgaBillingServices/service", () => ({
  billingOverview: jest.fn(),
  saveBillingConfig: jest.fn(),
  previewReminder: jest.fn(),
  runBillingTest: jest.fn()
}));
jest.mock("../../services/SgaBillingServices/transport", () => ({
  testPdf: jest.fn()
}));

type RouterLayer = {
  handle: unknown;
  regexp?: { toString(): string };
  route?: {
    path: string;
    stack: Array<{ handle: unknown }>;
  };
};

describe("SGA route authorization", () => {
  const stack = (sgaRoutes as unknown as { stack: RouterLayer[] }).stack;

  it("requires an administrator for the status endpoint", () => {
    const status = stack.find(layer => layer.route?.path === "/sga/status");

    expect(status).toBeDefined();
    expect(status?.route?.stack.map(layer => layer.handle)).toContain(isAdmin);
  });

  it("requires an administrator before every other SGA endpoint", () => {
    const adminGuard = stack.find(
      layer =>
        layer.handle === isAdmin && layer.regexp?.toString().includes("sga")
    );

    expect(adminGuard).toBeDefined();
  });
});
