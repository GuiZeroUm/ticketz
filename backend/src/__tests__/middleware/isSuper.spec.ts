import AppError from "../../errors/AppError";
import User from "../../models/User";
import isSuper from "../../middleware/isSuper";

jest.mock("../../models/User", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));

const findByPk = User.findByPk as jest.Mock;

const run = async (user: Record<string, unknown> | null) => {
  findByPk.mockResolvedValue(user);
  const next = jest.fn();
  const req = { user: { id: "10" } } as never;
  await isSuper(req, {} as never, next);
  return next;
};

describe("middleware isSuper", () => {
  beforeEach(() => {
    delete process.env.MASTER_COMPANY_ID;
  });

  it("libera o super da empresa master", async () => {
    const next = await run({ id: 10, super: true, companyId: 1 });
    expect(next).toHaveBeenCalled();
  });

  it("bloqueia usuario super de empresa cliente", async () => {
    await expect(
      run({ id: 10, super: true, companyId: 7 })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("bloqueia admin que nao e super", async () => {
    await expect(
      run({ id: 10, super: false, profile: "admin", companyId: 1 })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("bloqueia usuario inexistente", async () => {
    await expect(run(null)).rejects.toBeInstanceOf(AppError);
  });
});
