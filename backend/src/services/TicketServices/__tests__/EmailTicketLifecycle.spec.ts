import { Includeable } from "sequelize";
import { getIO } from "../../../libs/socket";
import { GetCompanySetting } from "../../../helpers/CheckSettings";
import CheckContactOpenTickets from "../../../helpers/CheckContactOpenTickets";
import GetTicketWbot from "../../../helpers/GetTicketWbot";
import Queue from "../../../models/Queue";
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import Whatsapp from "../../../models/Whatsapp";
import { incrementCounter } from "../../CounterServices/IncrementCounter";
import ShowUserService from "../../UserServices/ShowUserService";
import {
  startQueue,
  verifyMessage
} from "../../WbotServices/wbotMessageListener";
import SendWhatsAppMessage from "../../WbotServices/SendWhatsAppMessage";
import FindOrCreateATicketTrakingService from "../FindOrCreateATicketTrakingService";
import ListTicketsService from "../ListTicketsService";
import ResolveTicketTransferService from "../ResolveTicketTransferService";
import ShowTicketService from "../ShowTicketService";
import UpdateTicketService from "../UpdateTicketService";

jest.mock("../../../database", () => ({
  __esModule: true,
  default: { transaction: jest.fn() }
}));
jest.mock("../../../libs/socket");
jest.mock("../../../libs/wbot");
jest.mock("../../../helpers/CheckSettings");
jest.mock("../../../helpers/CheckContactOpenTickets");
jest.mock("../../../helpers/GetTicketWbot");
jest.mock("../../../helpers/SetTicketMessagesAsRead");
jest.mock("../../CounterServices/IncrementCounter");
jest.mock("../../UserServices/ShowUserService");
jest.mock("../FindOrCreateATicketTrakingService");
jest.mock("../ResolveTicketTransferService");
jest.mock("../ShowTicketService");
jest.mock("../../WbotServices/SendWhatsAppMessage");
jest.mock("../../WbotServices/wbotMessageListener", () => ({
  startQueue: jest.fn(),
  verifyMessage: jest.fn()
}));

const showTicket = ShowTicketService as jest.MockedFunction<
  typeof ShowTicketService
>;
const findTracking = FindOrCreateATicketTrakingService as jest.MockedFunction<
  typeof FindOrCreateATicketTrakingService
>;
const resolveTransfer = ResolveTicketTransferService as jest.MockedFunction<
  typeof ResolveTicketTransferService
>;
const sendWhatsAppMessage = SendWhatsAppMessage as jest.MockedFunction<
  typeof SendWhatsAppMessage
>;
const getSetting = GetCompanySetting as jest.MockedFunction<
  typeof GetCompanySetting
>;
const countEvent = incrementCounter as jest.MockedFunction<
  typeof incrementCounter
>;
const wbotSendMessage = jest.fn();

let tracking: {
  startedAt: Date | null;
  finishedAt: Date | null;
  ratingAt: Date | null;
  whatsappId?: number | null;
  save: jest.Mock;
};

const makeTicket = (data: Record<string, unknown>) => {
  const ticket: Record<string, unknown> & {
    update: jest.Mock;
    reload: jest.Mock;
  } = {
    id: 1,
    companyId: 10,
    contactId: 24,
    whatsappId: 6,
    emailAccountId: null,
    emailThreadKey: null,
    queueId: 7,
    userId: null,
    status: "pending",
    channel: "whatsapp",
    chatbot: false,
    queueOptionId: null,
    isGroup: false,
    contact: { isGroup: false, disableBot: false, number: "5511987654321" },
    whatsapp: {
      status: "CONNECTED",
      apiMode: "baileys",
      complationMessage: "Atendimento encerrado",
      ratingMessage: "Avalie",
      transferMessage: "Transferido"
    },
    user: null,
    update: jest.fn(),
    reload: jest.fn(),
    ...data
  };
  ticket.update.mockImplementation(async (values: object) => {
    Object.assign(ticket, values);
    return ticket;
  });
  ticket.reload.mockImplementation(async () => ticket);
  return ticket as unknown as Ticket & {
    update: jest.Mock;
    reload: jest.Mock;
  };
};

// Ticket de e-mail como o sync cria: sem conexão WhatsApp, com conta de e-mail
// e contato sem telefone. O objeto `whatsapp` fica ausente de propósito.
const makeEmailTicket = (data: Record<string, unknown> = {}) =>
  makeTicket({
    channel: "email",
    whatsappId: null,
    whatsapp: null,
    emailAccountId: 55,
    emailThreadKey: "thread-abc",
    contact: {
      isGroup: false,
      disableBot: false,
      number: null,
      channel: "email"
    },
    ...data
  });

const flushSocket = () => {
  const socket = { to: jest.fn(), emit: jest.fn() };
  socket.to.mockReturnValue(socket);
  (getIO as jest.MockedFunction<typeof getIO>).mockReturnValue(
    socket as unknown as ReturnType<typeof getIO>
  );
  return socket;
};

const run = async (
  ticket: Ticket,
  ticketData: Parameters<typeof UpdateTicketService>[0]["ticketData"],
  settings: Record<string, string> = {}
) => {
  flushSocket();
  jest.spyOn(User, "findByPk").mockResolvedValue({
    id: 3,
    name: "Ana",
    profile: "admin"
  } as User);
  showTicket.mockResolvedValue(ticket);
  tracking = {
    startedAt: null,
    finishedAt: null,
    ratingAt: null,
    save: jest.fn()
  };
  findTracking.mockResolvedValue(tracking as never);
  resolveTransfer.mockImplementation(async ({ ticket: current }) => ({
    whatsappId: current.whatsappId,
    connectionChanged: false,
    conflictingTicketId: null
  }));
  getSetting.mockImplementation(async (_companyId, key, fallback) =>
    key in settings ? settings[key] : fallback
  );
  (GetTicketWbot as jest.Mock).mockResolvedValue({
    sendMessage: wbotSendMessage
  });
  return UpdateTicketService({
    ticketData,
    ticketId: 1,
    companyId: 10
  });
};

const expectNoWhatsAppTraffic = () => {
  expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  expect(wbotSendMessage).not.toHaveBeenCalled();
  expect(GetTicketWbot).not.toHaveBeenCalled();
  expect(startQueue).not.toHaveBeenCalled();
  expect(verifyMessage).not.toHaveBeenCalled();
};

const allMessageSettings = {
  userRating: "enabled",
  ticketAcceptedMessage: "Olá, sou {{userName}}",
  transferMessage: "Você foi transferido"
};

beforeEach(() => {
  jest
    .spyOn(Queue, "findOne")
    .mockResolvedValue({ id: 8, companyId: 10 } as unknown as Queue);
  jest.spyOn(Ticket, "findOne").mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("email ticket lifecycle", () => {
  it("accepts a pending email ticket (status open, userId set) without calling ResolveTicketTransferService or any WhatsApp send", async () => {
    const ticket = makeEmailTicket({ status: "pending", userId: null });

    const result = await run(
      ticket,
      { status: "open", userId: 3, queueId: 7 },
      allMessageSettings
    );

    expect(resolveTransfer).not.toHaveBeenCalled();
    expectNoWhatsAppTraffic();
    expect(result.ticket.status).toBe("open");
    expect(result.ticket.userId).toBe(3);
    expect(ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "open",
        userId: 3,
        queueId: 7,
        whatsappId: null
      })
    );
    expect(findTracking).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 1, whatsappId: null })
    );
    expect(tracking.startedAt).toBeInstanceOf(Date);
    expect(countEvent).toHaveBeenCalledWith(10, "ticket-accept");
  });

  it("transfers an email ticket to another queue keeping whatsappId null and emailAccountId", async () => {
    const ticket = makeEmailTicket({ status: "pending", queueId: 7 });

    const result = await run(
      ticket,
      { status: "pending", userId: null, queueId: 8 },
      allMessageSettings
    );

    expect(resolveTransfer).not.toHaveBeenCalled();
    expectNoWhatsAppTraffic();
    expect(Queue.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 8, companyId: 10 } })
    );
    expect(result.ticket.queueId).toBe(8);
    expect(result.ticket.whatsappId).toBeNull();
    expect(result.ticket.emailAccountId).toBe(55);
    expect(ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ queueId: 8, whatsappId: null })
    );
    expect(ticket.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: expect.anything() })
    );
    expect(countEvent).toHaveBeenCalledWith(10, "ticket-transfer");
  });

  it("transfers an open email ticket to another user keeping the connection fields", async () => {
    const ticket = makeEmailTicket({ status: "open", userId: 3, queueId: 7 });

    const result = await run(
      ticket,
      { status: "open", userId: 4, queueId: 8 },
      allMessageSettings
    );

    expect(resolveTransfer).not.toHaveBeenCalled();
    expectNoWhatsAppTraffic();
    expect(result.ticket.userId).toBe(4);
    expect(result.ticket.whatsappId).toBeNull();
    expect(result.ticket.emailAccountId).toBe(55);
  });

  it("rejects a transfer of an email ticket to a queue of another company", async () => {
    (Queue.findOne as jest.Mock).mockResolvedValue(null);
    const ticket = makeEmailTicket({ status: "pending", queueId: 7 });

    await expect(
      run(ticket, { status: "pending", queueId: 99 })
    ).rejects.toMatchObject({
      message: "ERR_QUEUE_NOT_FOUND",
      statusCode: 404
    });
    expect(ticket.update).not.toHaveBeenCalled();
  });

  it("ignores a whatsappId sent for an email ticket", async () => {
    const ticket = makeEmailTicket({ status: "pending", queueId: 7 });

    const result = await run(ticket, {
      status: "pending",
      queueId: 8,
      whatsappId: 6
    });

    expect(resolveTransfer).not.toHaveBeenCalled();
    expect(result.ticket.whatsappId).toBeNull();
    expect(result.ticket.emailAccountId).toBe(55);
  });

  it("keeps whatsappId NULL when the modal sends the email account id as whatsappId", async () => {
    const ticket = makeEmailTicket({ status: "pending", queueId: 7 });

    const result = await run(ticket, {
      status: "pending",
      userId: null,
      queueId: 8,
      whatsappId: 55
    });

    expect(resolveTransfer).not.toHaveBeenCalled();
    expect(ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ queueId: 8, whatsappId: null })
    );
    expect(result.ticket.whatsappId).toBeNull();
    expect(result.ticket.emailAccountId).toBe(55);
  });

  it("closes and reopens an email ticket without sending rating/completion messages", async () => {
    const ticket = makeEmailTicket({ status: "open", userId: 3 });

    const closed = await run(
      ticket,
      { status: "closed" },
      { ...allMessageSettings, keepUserAndQueue: "enabled" }
    );

    expectNoWhatsAppTraffic();
    expect(closed.ticket.status).toBe("closed");
    expect(tracking.ratingAt).toBeNull();
    expect(tracking.finishedAt).toBeInstanceOf(Date);
    expect(tracking.whatsappId).toBeNull();
    expect(countEvent).toHaveBeenCalledWith(10, "ticket-close");

    jest.clearAllMocks();

    const reopened = await run(
      ticket,
      { status: "open", userId: 3 },
      allMessageSettings
    );

    expectNoWhatsAppTraffic();
    expect(resolveTransfer).not.toHaveBeenCalled();
    expect(reopened.ticket.status).toBe("open");
    expect(reopened.ticket.whatsappId).toBeNull();
    expect(reopened.ticket.emailAccountId).toBe(55);
    expect(countEvent).toHaveBeenCalledWith(10, "ticket-reopen");
  });

  it("reopens a closed email ticket even when the contact has another open ticket on a different thread", async () => {
    const ticket = makeEmailTicket({ status: "closed", userId: 3 });

    await run(ticket, { status: "open", userId: 3 });

    // O guarda genérico por contato/conexão olha tickets de WhatsApp também;
    // no e-mail a unicidade é por thread.
    expect(CheckContactOpenTickets).not.toHaveBeenCalled();
    expect(Ticket.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 10,
          emailAccountId: 55,
          emailThreadKey: "thread-abc"
        })
      })
    );
    expect(ticket.status).toBe("open");
  });

  it("refuses to reopen an email ticket when its thread already has an active ticket", async () => {
    (Ticket.findOne as jest.Mock).mockResolvedValue({ id: 2 });
    const ticket = makeEmailTicket({ status: "closed", userId: 3 });

    await expect(
      run(ticket, { status: "open", userId: 3 })
    ).rejects.toMatchObject({ message: "ERR_OTHER_OPEN_TICKET" });
    expect(ticket.update).not.toHaveBeenCalled();
  });
});

describe("WhatsApp tickets keep their lifecycle", () => {
  it("a WhatsApp ticket transfer still calls ResolveTicketTransferService", async () => {
    const ticket = makeTicket({
      status: "pending",
      queueId: 7,
      contact: { isGroup: false, disableBot: true, number: "5511987654321" }
    });

    await run(ticket, { status: "pending", userId: null, queueId: 8 });

    expect(resolveTransfer).toHaveBeenCalledWith({
      ticket,
      whatsappId: undefined,
      queueId: 8
    });
    expect(Queue.findOne).not.toHaveBeenCalled();
    expect(ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ queueId: 8, whatsappId: 6 })
    );
  });

  it("an official API ticket transfer still calls ResolveTicketTransferService", async () => {
    const ticket = makeTicket({
      status: "pending",
      queueId: 7,
      contact: { isGroup: false, disableBot: true, number: "5511987654321" },
      whatsapp: { status: "CONNECTED", apiMode: "official" }
    });

    await run(ticket, { status: "pending", queueId: 8 });

    expect(resolveTransfer).toHaveBeenCalledTimes(1);
  });

  it("a WhatsApp ticket reopen still checks the contact's open tickets on its connection", async () => {
    const ticket = makeTicket({ status: "closed", userId: 3, queueId: 7 });

    await run(ticket, { status: "open", userId: 3 });

    expect(CheckContactOpenTickets).toHaveBeenCalledWith(24, 6);
    expect(Ticket.findOne).not.toHaveBeenCalled();
  });
});

describe("ticket lists and details include email tickets", () => {
  const findAllIncludes = async () => {
    (ShowUserService as jest.Mock).mockResolvedValue({
      id: 3,
      profile: "admin"
    });
    getSetting.mockImplementation(
      async (_companyId, _key, fallback) => fallback
    );
    const findAll = jest.spyOn(Ticket, "findAll").mockResolvedValue([]);

    await ListTicketsService({
      userId: "3",
      companyId: 10,
      status: "pending",
      queueIds: [],
      tags: [],
      users: []
    });

    return findAll.mock.calls[0][0].include as Includeable[];
  };

  it("ListTicketsService includes email tickets (whatsapp include not required)", async () => {
    const includes = await findAllIncludes();
    const whatsappInclude = includes.find(
      include => (include as { model?: unknown }).model === Whatsapp
    ) as { required?: boolean };

    expect(whatsappInclude).toBeDefined();
    expect(whatsappInclude.required).toBe(false);
  });

  it("ListTicketsService does not filter out tickets without a connection", async () => {
    await findAllIncludes();
    const { where } = (Ticket.findAll as jest.Mock).mock.calls[0][0];

    expect(JSON.stringify(where)).not.toContain("whatsappId");
    expect(JSON.stringify(where)).not.toContain("channel");
  });
});
