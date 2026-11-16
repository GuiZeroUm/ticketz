import AppError from "../../../errors/AppError";
import User from "../../../models/User";
import ShowUserService from "../ShowUserService";
import UpdateUserService from "../UpdateUserService";
import DeleteUserService from "../DeleteUserService";

jest.mock("../../../models/User", () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findOne: jest.fn() }
}));
jest.mock("../../../models/Company", () => ({
  __esModule: true,
  default: { findByPk: jest.fn().mockResolvedValue({ id: 7 }) }
}));
jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: class MockTicket {}
}));
jest.mock("../ShowUserService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../McpServices/RevokeMcpGrantsService", () => ({
  revokeUserMcpGrants: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../../WhatsappGroupServices/ValidateGroupAccessIds", () => ({
  __esModule: true,
  default: jest.fn(async ids => ids)
}));
jest.mock("../../../helpers/UpdateDeletedUserOpenTicketsStatus", () => ({
  __esModule: true,
  default: jest.fn()
}));

const findByPk = User.findByPk as jest.Mock;
const findOne = User.findOne as jest.Mock;
const showUser = ShowUserService as jest.Mock;

const target = (data: Record<string, unknown>) => ({
  id: 20,
  name: "Pessoa alvo",
  email: "alvo@example.com",
  profile: "admin",
  super: false,
  companyId: 7,
  queues: [],
  update: jest.fn().mockResolvedValue(undefined),
  reload: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn().mockResolvedValue(undefined),
  $set: jest.fn().mockResolvedValue(undefined),
  $get: jest.fn().mockResolvedValue([]),
  ...data
});

const clientAdmin = { id: 30, profile: "admin", super: false, companyId: 7 };
const masterSuper = { id: 1, profile: "admin", super: true, companyId: 1 };

describe("protecao de usuarios super", () => {
  beforeEach(() => {
    delete process.env.MASTER_COMPANY_ID;
    findByPk.mockReset();
    findOne.mockReset();
    showUser.mockReset();
  });

  describe("UpdateUserService", () => {
    const update = (user, requestUser, userData = {}) => {
      showUser.mockResolvedValue(user);
      findByPk.mockResolvedValue(requestUser);
      return UpdateUserService({
        userData: { password: "nova-senha", ...userData },
        userId: user.id,
        requestUserId: requestUser.id
      });
    };

    it("admin da empresa cliente nao altera usuario super da empresa", async () => {
      const copy = target({ super: true });
      await expect(update(copy, clientAdmin)).rejects.toMatchObject({
        message: "ERR_FORBIDDEN",
        statusCode: 403
      });
      expect(copy.update).not.toHaveBeenCalled();
    });

    it("admin da empresa master que nao e super nao altera o super", async () => {
      const platformSuper = target({ id: 1, super: true, companyId: 1 });
      const masterAdmin = {
        id: 31,
        profile: "admin",
        super: false,
        companyId: 1
      };
      await expect(update(platformSuper, masterAdmin)).rejects.toBeInstanceOf(
        AppError
      );
      expect(platformSuper.update).not.toHaveBeenCalled();
    });

    it("super da empresa master altera usuario super de empresa cliente", async () => {
      const copy = target({ super: true });
      await update(copy, masterSuper);
      expect(copy.update).toHaveBeenCalled();
    });

    it("usuario super altera os proprios dados", async () => {
      const copy = target({ super: true });
      await update(copy, { ...copy });
      expect(copy.update).toHaveBeenCalled();
    });

    it("admin da empresa cliente continua alterando usuario comum", async () => {
      const user = target({ profile: "user" });
      await update(user, clientAdmin);
      expect(user.update).toHaveBeenCalled();
    });

    it("ignora o campo super enviado no corpo", async () => {
      const user = target({ profile: "user" });
      const result = await update(user, clientAdmin, { super: true });
      const fields = user.update.mock.calls[0][0];
      expect(fields).not.toHaveProperty("super");
      expect((result as unknown as { super: boolean }).super).toBe(false);
    });

    it("informa super=false para usuario super de empresa cliente", async () => {
      const copy = target({ super: true });
      const result = await update(copy, masterSuper);
      expect((result as unknown as { super: boolean }).super).toBe(false);
    });
  });

  describe("DeleteUserService", () => {
    const remove = (user, requestUser) => {
      findOne.mockResolvedValue(user);
      findByPk.mockResolvedValue(requestUser);
      return DeleteUserService(user.id, requestUser.id);
    };

    it("admin da empresa cliente nao apaga usuario super da empresa", async () => {
      const copy = target({ super: true });
      await expect(remove(copy, clientAdmin)).rejects.toMatchObject({
        message: "ERR_FORBIDDEN",
        statusCode: 403
      });
      expect(copy.destroy).not.toHaveBeenCalled();
    });

    it("usuario super de empresa cliente nao apaga usuario de outra empresa", async () => {
      const copySuper = { id: 40, profile: "admin", super: true, companyId: 7 };
      const other = target({ companyId: 8 });
      await expect(remove(other, copySuper)).rejects.toBeInstanceOf(AppError);
      expect(other.destroy).not.toHaveBeenCalled();
    });

    it("super da empresa master apaga usuario super de empresa cliente", async () => {
      const copy = target({ super: true });
      await remove(copy, masterSuper);
      expect(copy.destroy).toHaveBeenCalled();
    });

    it("admin da empresa cliente continua apagando usuario comum", async () => {
      const user = target({ profile: "user" });
      await remove(user, clientAdmin);
      expect(user.destroy).toHaveBeenCalled();
    });

    it("responde 404 quando o usuario nao existe", async () => {
      findOne.mockResolvedValue(null);
      findByPk.mockResolvedValue(clientAdmin);
      await expect(DeleteUserService(99, clientAdmin.id)).rejects.toMatchObject(
        {
          statusCode: 404
        }
      );
    });
  });
});
