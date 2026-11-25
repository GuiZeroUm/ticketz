/* eslint-disable @typescript-eslint/no-explicit-any */
import User from "../../models/User";
import requirePlatformSuper from "../requirePlatformSuper";

jest.mock("../../models/User", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));

const run = async (user: Record<string, any> | null) => {
  (User.findByPk as jest.Mock).mockResolvedValue(user);
  const next = jest.fn();
  const req = { user: { id: "3" } } as any;
  try {
    await requirePlatformSuper(req, {} as any, next);
    return { next: next.mock.calls.length, error: null };
  } catch (error) {
    return { next: next.mock.calls.length, error };
  }
};

describe("requirePlatformSuper (cancel fiscal note)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MASTER_COMPANY_ID;
  });

  it("refuses the billing admin with 403", async () => {
    const result = await run({
      id: 3,
      super: false,
      profile: "admin",
      companyId: 1
    });
    expect(result.next).toBe(0);
    expect(result.error).toMatchObject({
      message: "ERR_NO_PERMISSION",
      statusCode: 403
    });
  });

  it("refuses a super flag outside the master company", async () => {
    const result = await run({
      id: 3,
      super: true,
      profile: "admin",
      companyId: 7
    });
    expect(result.error).toMatchObject({ statusCode: 403 });
  });

  it("lets the platform super admin through", async () => {
    const result = await run({
      id: 3,
      super: true,
      profile: "admin",
      companyId: 1
    });
    expect(result).toEqual({ next: 1, error: null });
  });
});
