import { verify } from "jsonwebtoken";
import sequelize from "../../../database";
import { initIO } from "../../../libs/socket";
import { getTicketAccessMode } from "../../TicketServices/TicketAccessPolicy";
import GroupQueue from "../../../models/GroupQueue";
import GroupReadState from "../../../models/GroupReadState";
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import UserQueue from "../../../models/UserQueue";
import NotifyNewMessageService from "../../PushNotificationServices/NotifyNewMessageService";
import SendPushNotificationService from "../../PushNotificationServices/SendPushNotificationService";
import GetGroupUnreadCountService from "../GetGroupUnreadCountService";
import { assertGroupAccess } from "../GroupAccessService";
import { incrementGroupUnread } from "../GroupUnreadService";
import ListGroupsService from "../ListGroupsService";

// Pins who sees what for AC Norte. These tests also pass on origin/acnorte
// (4c132be0): the performance release must not change any of this.

const mockIo = { on: jest.fn(), to: jest.fn() };

// The real module reads its secret from Redis on load.
jest.mock("../../../config/auth", () => ({
  __esModule: true,
  default: { secret: "test" }
}));
jest.mock("socket.io", () => ({ Server: jest.fn(() => mockIo) }));
jest.mock("@socket.io/admin-ui", () => ({ instrument: jest.fn() }));
jest.mock("jsonwebtoken", () => ({ verify: jest.fn() }));
jest.mock("../../../utils/logger", () => ({
  logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
  setSocketIo: jest.fn(),
  socketSendBuffer: []
}));
jest.mock("../../../database", () => ({
  __esModule: true,
  default: { query: jest.fn() }
}));
jest.mock("../../../models/GroupQueue", () => ({
  __esModule: true,
  default: { findAll: jest.fn(), count: jest.fn() }
}));
jest.mock("../../../models/GroupReadState", () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOrCreate: jest.fn() }
}));
jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn()
  }
}));
jest.mock("../../../models/User", () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() }
}));
jest.mock("../../../models/UserQueue", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));
jest.mock("../../../models/UserSocketSession", () => ({
  __esModule: true,
  default: {
    update: jest.fn().mockResolvedValue([0]),
    create: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0)
  }
}));
jest.mock("../../../models/Contact", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/Company", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/Queue", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/Whatsapp", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/Message", () => ({ __esModule: true, default: {} }));
jest.mock("../../DecoupledDriverServices/DecoupledDriverServices", () => ({
  DecoupledDriverServices: { getInstance: jest.fn(() => ({})) }
}));
jest.mock("../../TicketServices/TicketAccessPolicy", () => ({
  getTicketAccessMode: jest.fn(),
  usesOwnerTicketAccess: jest.fn().mockResolvedValue(true)
}));
jest.mock("../../../helpers/tenantRuntime", () => ({
  runtimeOwnsCompany: jest.fn(() => true),
  runtimeCompanyWhere: jest.fn(() => ({}))
}));
jest.mock("../../../helpers/corsOrigin", () => ({ corsOrigin: jest.fn() }));
jest.mock("../../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn().mockResolvedValue("enabled")
}));
jest.mock("../../../config/webPush", () => ({
  isWebPushConfigured: jest.fn(() => true)
}));
jest.mock("../../PushNotificationServices/SendPushNotificationService", () => ({
  __esModule: true,
  default: jest.fn()
}));

const COMPANY = 9;
const ATTENDANT = 7;
const OTHER_USER = 8;
const ADMIN = 1;
const GROUP = 50;

const attendant = (queues: Array<{ id: number }> = []) => ({
  id: ATTENDANT,
  companyId: COMPANY,
  profile: "user",
  queues,
  company: { status: true },
  save: jest.fn().mockResolvedValue(undefined)
});

beforeEach(() => {
  (GroupQueue.findAll as jest.Mock).mockReset().mockResolvedValue([]);
  (GroupQueue.count as jest.Mock).mockReset().mockResolvedValue(0);
  (User.findAll as jest.Mock).mockReset().mockResolvedValue([]);
  (User.findByPk as jest.Mock).mockReset();
  (User.findOne as jest.Mock).mockReset();
  (UserQueue.findAll as jest.Mock).mockReset().mockResolvedValue([]);
  (Ticket.findByPk as jest.Mock).mockReset();
  (Ticket.findOne as jest.Mock).mockReset();
  (Ticket.findAndCountAll as jest.Mock).mockReset();
  (sequelize.query as jest.Mock).mockReset().mockResolvedValue([{ count: 0 }]);
  (SendPushNotificationService as jest.Mock).mockReset();
  (GroupReadState.findOrCreate as jest.Mock).mockReset();
  (getTicketAccessMode as jest.Mock).mockReset().mockResolvedValue("owner");
  mockIo.on.mockReset();
  mockIo.to.mockReset().mockReturnValue({ to: mockIo.to, emit: jest.fn() });
});

describe("conversation group with no queue, non-admin user", () => {
  it("is not listed", async () => {
    (User.findByPk as jest.Mock).mockResolvedValue(attendant());
    (User.findOne as jest.Mock).mockResolvedValue(attendant());

    const result = await ListGroupsService({
      companyId: COMPANY,
      userId: ATTENDANT,
      profile: "user"
    });

    expect(result).toEqual({ groups: [], count: 0, hasMore: false });
    expect(Ticket.findAndCountAll).not.toHaveBeenCalled();
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  it("is not counted as unread", async () => {
    (User.findOne as jest.Mock).mockResolvedValue(attendant());

    await GetGroupUnreadCountService(ATTENDANT, COMPANY, "user");

    const sql = (sequelize.query as jest.Mock).mock.calls[0][0];
    expect(sql).toContain('INNER JOIN "UserQueues"');
    expect(sql).not.toContain("NOT EXISTS");
  });

  it("does not raise the unread count", async () => {
    (User.findAll as jest.Mock).mockResolvedValue([
      { id: ADMIN, profile: "admin", queues: [] },
      { id: ATTENDANT, profile: "user", queues: [{ id: 3 }] }
    ]);
    (GroupReadState.findOrCreate as jest.Mock).mockResolvedValue([
      { increment: jest.fn() }
    ]);
    (mockIo.to as jest.Mock).mockReturnValue({
      to: mockIo.to,
      emit: jest.fn()
    });
    initIO({} as never);

    await incrementGroupUnread(
      {
        id: 100,
        companyId: COMPANY,
        contactId: GROUP,
        isGroup: true,
        contact: { groupMode: "conversation" }
      } as never,
      undefined
    );

    const users = (GroupReadState.findOrCreate as jest.Mock).mock.calls.map(
      ([options]) => options.where.userId
    );
    expect(users).toEqual([ADMIN]);
  });

  it("does not receive a push", async () => {
    (User.findAll as jest.Mock).mockImplementation(async ({ where }) =>
      where.profile === "admin"
        ? [{ id: ADMIN }]
        : [
            { id: ADMIN, profile: "admin", queues: [] },
            { id: ATTENDANT, profile: "user", queues: [] }
          ]
    );

    await NotifyNewMessageService({
      companyId: COMPANY,
      ticketId: 100,
      fromMe: false,
      read: false,
      body: "x",
      ticket: {
        id: 100,
        contactId: GROUP,
        isGroup: true,
        contact: { groupMode: "conversation", name: "Grupo" }
      }
    } as never);

    expect(SendPushNotificationService).toHaveBeenCalledTimes(1);
    expect(
      (SendPushNotificationService as jest.Mock).mock.calls[0][0].userIds
    ).toEqual([ADMIN]);
  });

  it("cannot open the group", async () => {
    (Ticket.findOne as jest.Mock).mockResolvedValue({
      id: 100,
      contactId: GROUP,
      contact: { groupMode: "conversation" }
    });
    (User.findByPk as jest.Mock).mockResolvedValue(attendant());
    (User.findOne as jest.Mock).mockResolvedValue(attendant());

    await expect(
      assertGroupAccess(100, {
        id: ATTENDANT,
        companyId: COMPANY,
        profile: "user"
      })
    ).rejects.toMatchObject({ message: "ERR_NO_PERMISSION" });
  });
});

describe("joinChatBox", () => {
  const joinChatBox = async (
    ticket: Record<string, unknown>
  ): Promise<string[]> => {
    (verify as jest.Mock).mockReturnValue({ id: ATTENDANT });
    (User.findByPk as jest.Mock).mockResolvedValue(attendant());
    (Ticket.findByPk as jest.Mock).mockResolvedValue({
      id: 100,
      companyId: COMPANY,
      contactId: GROUP,
      isGroup: true,
      queueId: null,
      ...ticket
    });
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const socket = {
      id: "socket-1",
      handshake: { query: { token: "token" } },
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      emit: jest.fn()
    };

    initIO({} as never);
    const onConnection = mockIo.on.mock.calls.find(
      ([event]) => event === "connection"
    )[1];
    await onConnection(socket);
    socket.join.mockClear();

    await handlers.joinChatBox("100");
    await new Promise(resolve => setImmediate(resolve));

    return socket.join.mock.calls.map(([room]) => room);
  };

  it("keeps the room for the non-admin owner of a service-mode group ticket with no queue access", async () => {
    const rooms = await joinChatBox({
      userId: ATTENDANT,
      contact: { groupMode: "ticket" }
    });

    expect(rooms).toEqual(["100"]);
  });

  it("denies a conversation group with no queue under owner-mode isolation", async () => {
    const rooms = await joinChatBox({
      userId: null,
      contact: { groupMode: "conversation" }
    });

    expect(rooms).toEqual([]);
  });

  it("denies a service-mode group ticket owned by someone else", async () => {
    const rooms = await joinChatBox({
      userId: OTHER_USER,
      contact: { groupMode: "ticket" }
    });

    expect(rooms).toEqual([]);
  });
});

describe("supplier portal", () => {
  it("still lists groups as admin through the profile argument", async () => {
    (GroupQueue.findAll as jest.Mock).mockResolvedValue([]);
    (Ticket.findAndCountAll as jest.Mock).mockResolvedValue({
      rows: [],
      count: 0
    });
    (GroupReadState.findAll as jest.Mock).mockResolvedValue([]);

    await ListGroupsService({
      companyId: COMPANY,
      userId: ATTENDANT,
      profile: "admin",
      whatsappId: 17
    });

    const options = (Ticket.findAndCountAll as jest.Mock).mock.calls[0][0];
    expect(options.where).toEqual(expect.objectContaining({ whatsappId: 17 }));
    expect(options.include[0].where.id).toBeUndefined();
  });
});
