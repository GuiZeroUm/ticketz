import sequelize from "../../../database";
import GroupQueue from "../../../models/GroupQueue";
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import GetGroupUnreadCountService from "../GetGroupUnreadCountService";
import ListGroupsService from "../ListGroupsService";
import { getUserGroupScope } from "../GroupAccessService";

jest.mock("../../../database", () => ({
  __esModule: true,
  default: { query: jest.fn() }
}));
jest.mock("../../../models/GroupQueue", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));
jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: { findAndCountAll: jest.fn() }
}));
jest.mock("../../../models/User", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/Contact", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/GroupReadState", () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock("../../../models/Queue", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/Whatsapp", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../GroupAccessService", () => ({ getUserGroupScope: jest.fn() }));

const querySql = () => (sequelize.query as jest.Mock).mock.calls[0][0];

beforeEach(() => {
  jest.clearAllMocks();
  (sequelize.query as jest.Mock).mockResolvedValue([{ count: 0 }]);
  (User.findOne as jest.Mock).mockResolvedValue({ profile: "user" });
  (getUserGroupScope as jest.Mock).mockResolvedValue({
    queueIds: [],
    groupAccessIds: [],
    profile: "user"
  });
  (Ticket.findAndCountAll as jest.Mock).mockResolvedValue({
    rows: [],
    count: 0
  });
});

describe("GetGroupUnreadCountService", () => {
  it("keeps the access condition for a common user", async () => {
    await GetGroupUnreadCountService(7, 9);
    expect(querySql()).toContain("groupAccessIds");
  });

  it("drops the access condition in the supplier portal", async () => {
    await GetGroupUnreadCountService(7, 9, undefined, true);
    expect(querySql()).not.toContain("groupAccessIds");
  });

  it("keeps the connection filter", async () => {
    await GetGroupUnreadCountService(7, 9, 17, true);
    expect(querySql()).toContain('ticket."whatsappId" = :whatsappId');
    expect(
      (sequelize.query as jest.Mock).mock.calls[0][1].replacements
    ).toEqual(expect.objectContaining({ whatsappId: 17 }));
  });
});

describe("ListGroupsService", () => {
  it("returns nothing to a common user with no granted group", async () => {
    const result = await ListGroupsService({ companyId: 9, userId: 7 });
    expect(result).toEqual({ groups: [], count: 0, hasMore: false });
    expect(Ticket.findAndCountAll).not.toHaveBeenCalled();
  });

  it("lists every group in the supplier portal, filtered by connection", async () => {
    await ListGroupsService({
      companyId: 9,
      userId: 7,
      treatAsAdmin: true,
      whatsappId: 17
    });
    expect(GroupQueue.findAll).not.toHaveBeenCalled();
    const options = (Ticket.findAndCountAll as jest.Mock).mock.calls[0][0];
    expect(options.where).toEqual(expect.objectContaining({ whatsappId: 17 }));
    expect(options.include[0].where.id).toBeUndefined();
  });
});
