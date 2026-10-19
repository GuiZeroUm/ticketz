import { Request, Response } from "express";
import { Op } from "sequelize";
import { isWebPushConfigured } from "../../config/webPush";
import { getIO } from "../../libs/socket";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { update as updateContactController } from "../../controllers/ContactController";
import { incrementCounter } from "../CounterServices/IncrementCounter";
import ShowContactService from "../ContactServices/ShowContactService";
import UpdateContactService from "../ContactServices/UpdateContactService";
import NotifyNewMessageService from "../PushNotificationServices/NotifyNewMessageService";
import SendPushNotificationService from "../PushNotificationServices/SendPushNotificationService";
import ScheduleCreateService from "../ScheduleServices/CreateService";
import ScheduleUpdateService from "../ScheduleServices/UpdateService";
import ScheduleShowService from "../ScheduleServices/ShowService";
import { failDeliveryWithoutPhone } from "../ScheduleServices/deliveryGuards";
import CreateTicketService from "../TicketServices/CreateTicketService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import ResolveTicketTransferService from "../TicketServices/ResolveTicketTransferService";
import ShowTicketService from "../TicketServices/ShowTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { startQueue, verifyMessage } from "../WbotServices/wbotMessageListener";
import CheckContactNumber from "../WbotServices/CheckNumber";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import {
  campaignRecipientWhere,
  filterCampaignRecipients
} from "../CampaignService/recipients";

jest.mock("../../config/webPush", () => ({
  __esModule: true,
  default: {},
  isWebPushConfigured: jest.fn()
}));
jest.mock("../../database", () => ({
  __esModule: true,
  default: { transaction: jest.fn() }
}));
jest.mock("../../libs/socket");
jest.mock("../../libs/wbot");
jest.mock("../../helpers/CheckSettings");
jest.mock("../../helpers/CheckContactOpenTickets");
jest.mock("../../helpers/GetDefaultWhatsApp");
jest.mock("../../helpers/GetTicketWbot");
jest.mock("../../helpers/SetTicketMessagesAsRead");
jest.mock("../CounterServices/IncrementCounter");
jest.mock("../ContactServices/ShowContactService");
jest.mock("../PushNotificationServices/SendPushNotificationService");
jest.mock("../ScheduleServices/assertScheduleProvider", () => ({
  assertScheduleProvider: jest.fn()
}));
jest.mock("../ScheduleServices/ShowService");
jest.mock("../TicketServices/FindOrCreateATicketTrakingService");
jest.mock("../TicketServices/ResolveTicketTransferService");
jest.mock("../TicketServices/ShowTicketService");
jest.mock("../WbotServices/CheckNumber");
jest.mock("../WbotServices/SendWhatsAppMessage");
jest.mock("../WbotServices/verifyContact", () => ({
  verifyContact: jest.fn()
}));
jest.mock("../WbotServices/wbotMessageListener", () => ({
  startQueue: jest.fn(),
  verifyMessage: jest.fn()
}));

const getSetting = GetCompanySetting as jest.MockedFunction<
  typeof GetCompanySetting
>;

const flushSocket = () => {
  const socket = { to: jest.fn(), emit: jest.fn() };
  socket.to.mockReturnValue(socket);
  (getIO as jest.MockedFunction<typeof getIO>).mockReturnValue(
    socket as unknown as ReturnType<typeof getIO>
  );
  return socket;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("NotifyNewMessageService with email-only contacts", () => {
  const makeMessage = (contact: Partial<Contact>) =>
    ({
      fromMe: false,
      read: false,
      companyId: 4,
      ticketId: 9,
      body: "Olá",
      ticket: {
        id: 9,
        uuid: "uuid-9",
        isGroup: false,
        userId: 5,
        status: "open",
        user: { name: "Ana" },
        contact: { name: "Maria", number: null, ...contact }
      }
    }) as unknown as Message;

  beforeEach(() => {
    (isWebPushConfigured as jest.Mock).mockReturnValue(true);
  });

  it("does not throw for a contact without number and titles with the name", async () => {
    await expect(
      NotifyNewMessageService(makeMessage({ name: "Maria" }))
    ).resolves.toBeUndefined();

    expect(SendPushNotificationService).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ title: "Maria" })
      })
    );
  });

  it("falls back to the contact email when the name is only digits", async () => {
    await NotifyNewMessageService(
      makeMessage({ name: "123456", email: "maria@example.com" })
    );

    expect(SendPushNotificationService).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ title: "maria@example.com" })
      })
    );
  });

  it("still formats the phone of WhatsApp contacts with a numeric name", async () => {
    await NotifyNewMessageService(
      makeMessage({ name: "5511987654321", number: "5511987654321" })
    );

    expect(SendPushNotificationService).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ title: "(11) 98765-4321" })
      })
    );
  });
});

describe("scheduled messages and contacts without phone", () => {
  const baseBody = { body: "Mensagem de teste", companyId: 3, contactId: 8 };

  beforeEach(() => {
    jest.spyOn(ContactCustomField, "findAll").mockResolvedValue([]);
  });

  it("CreateScheduleService rejects contact without number with ERR_CONTACT_HAS_NO_PHONE", async () => {
    jest.spyOn(Contact, "count").mockResolvedValue(1);
    jest.spyOn(Contact, "findAll").mockResolvedValue([]);

    await expect(
      ScheduleCreateService({
        ...baseBody,
        sendAt: "2099-01-01T10:00"
      })
    ).rejects.toMatchObject({
      message: "ERR_CONTACT_HAS_NO_PHONE",
      statusCode: 400
    });
    expect(Contact.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ companyId: 3, number: null })
    });
  });

  it("UpdateScheduleService rejects contact without number with ERR_CONTACT_HAS_NO_PHONE", async () => {
    jest.spyOn(Contact, "count").mockResolvedValue(1);
    jest.spyOn(Contact, "findAll").mockResolvedValue([]);
    (ScheduleShowService as jest.Mock).mockResolvedValue({
      id: 1,
      kind: "ONCE",
      contactId: null,
      audienceContacts: [{ contactId: 8 }],
      toJSON: () => ({
        body: "Mensagem de teste",
        kind: "ONCE",
        audienceMode: "SELECTED",
        sendAt: "2099-01-01T10:00",
        timezone: "UTC"
      })
    });

    await expect(
      ScheduleUpdateService({
        id: 1,
        companyId: 3,
        scheduleData: { contactIds: [8] }
      })
    ).rejects.toMatchObject({
      message: "ERR_CONTACT_HAS_NO_PHONE",
      statusCode: 400
    });
  });

  it("does not reject WhatsApp contacts that have a number", async () => {
    jest.spyOn(Contact, "count").mockResolvedValue(0);
    jest.spyOn(Contact, "findAll").mockResolvedValue([]);

    await expect(
      ScheduleCreateService({ ...baseBody, sendAt: "2099-01-01T10:00" })
    ).rejects.toMatchObject({ message: "ERR_SCHEDULE_INVALID_RECIPIENT" });
  });

  it("marks the delivery as failed without throwing when the contact has no number", async () => {
    const delivery = { contact: { id: 8, number: null }, update: jest.fn() };

    const blocked = await failDeliveryWithoutPhone(
      delivery as unknown as Parameters<typeof failDeliveryWithoutPhone>[0]
    );

    expect(blocked).toBe(true);
    expect(delivery.update).toHaveBeenCalledWith({
      status: "ERROR",
      errorMessage: "ERR_CONTACT_HAS_NO_PHONE"
    });
  });

  it("lets deliveries with a number proceed untouched", async () => {
    const delivery = {
      contact: { id: 8, number: "5511987654321" },
      update: jest.fn()
    };

    const blocked = await failDeliveryWithoutPhone(
      delivery as unknown as Parameters<typeof failDeliveryWithoutPhone>[0]
    );

    expect(blocked).toBe(false);
    expect(delivery.update).not.toHaveBeenCalled();
  });
});

describe("campaign recipients", () => {
  it("campaign recipients skip contacts with null number", () => {
    const recipients = filterCampaignRecipients([
      { id: 1, number: "5511987654321" },
      { id: 2, number: null },
      { id: 3, number: "" },
      { id: 4, number: "5511912345678@lid" }
    ]);

    // Só NULL sai; número em branco segue como antes (R12).
    expect(recipients.map(item => item.id)).toEqual([1, 3, 4]);
  });

  it("excludes only NULL numbers from the recipient query", () => {
    const where = campaignRecipientWhere();

    expect(where.isWhatsappValid).toBe(true);
    expect(where.number[Op.ne]).toBeNull();
  });

  it("query and filter agree on blank and null numbers", () => {
    const where = campaignRecipientWhere();
    const keptByQuery = (number: string | null) =>
      number !== where.number[Op.ne];
    const items = [
      { id: 1, number: "" },
      { id: 2, number: null }
    ];

    const keptByFilter = filterCampaignRecipients(items).map(item => item.id);

    expect(keptByQuery("")).toBe(true);
    expect(keptByQuery(null)).toBe(false);
    expect(keptByFilter).toEqual([1]);
  });
});

describe("contact updates for the email channel", () => {
  const makeContact = (data: Record<string, unknown>) => {
    const contact = {
      id: 12,
      companyId: 2,
      isGroup: false,
      nameLocked: false,
      name: "Maria",
      extraInfo: [],
      tags: [],
      update: jest.fn(),
      reload: jest.fn(),
      ...data
    };
    contact.update.mockImplementation(async () => contact);
    contact.reload.mockImplementation(async () => contact);
    return contact;
  };

  beforeEach(() => {
    flushSocket();
  });

  it("UpdateContactService keeps number null for channel email", async () => {
    const contact = makeContact({
      channel: "email",
      number: null,
      email: "maria@example.com"
    });
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(contact as unknown as Contact);

    await UpdateContactService({
      contactData: { name: "Maria Souza", email: "maria@example.com" },
      contactId: "12",
      companyId: 2
    });

    const updateArg = contact.update.mock.calls[0][0];
    expect(updateArg.number ?? null).toBeNull();
    expect(updateArg.name).toBe("Maria Souza");
  });

  it("UpdateContactService ignores a blank number for channel email", async () => {
    const contact = makeContact({ channel: "email", number: null });
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(contact as unknown as Contact);

    await UpdateContactService({
      contactData: { name: "Maria", number: "" },
      contactId: "12",
      companyId: 2
    });

    expect(contact.update.mock.calls[0][0].number ?? null).toBeNull();
  });

  it("UpdateContactService turns an email contact that gains a phone into a WhatsApp contact", async () => {
    const contact = makeContact({
      channel: "email",
      number: null,
      email: "maria@example.com"
    });
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(contact as unknown as Contact);

    await UpdateContactService({
      contactData: { name: "Maria", number: "5511911111111" },
      contactId: "12",
      companyId: 2
    });

    expect(contact.update.mock.calls[0][0]).toMatchObject({
      number: "5511911111111",
      channel: "whatsapp"
    });
  });

  it("UpdateContactService keeps an email contact when the number is only whitespace", async () => {
    const contact = makeContact({ channel: "email", number: null });
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(contact as unknown as Contact);

    await UpdateContactService({
      contactData: { name: "Maria", number: "   " },
      contactId: "12",
      companyId: 2
    });

    const updateArg = contact.update.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty("channel");
    expect(updateArg).not.toHaveProperty("number");
  });

  it("UpdateContactService stores the trimmed number when an email contact gains a phone", async () => {
    const contact = makeContact({ channel: "email", number: null });
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(contact as unknown as Contact);

    await UpdateContactService({
      contactData: { name: "Maria", number: " 5511911111111 " },
      contactId: "12",
      companyId: 2
    });

    expect(contact.update.mock.calls[0][0]).toMatchObject({
      number: "5511911111111",
      channel: "whatsapp"
    });
  });

  it("UpdateContactService reloads the channel so socket payloads carry it", async () => {
    const contact = makeContact({ channel: "email", number: null });
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(contact as unknown as Contact);

    await UpdateContactService({
      contactData: { name: "Maria" },
      contactId: "12",
      companyId: 2
    });

    expect(contact.update.mock.calls[0][0]).not.toHaveProperty("channel");
    expect(contact.reload.mock.calls[0][0].attributes).toContain("channel");
  });

  it("UpdateContactService does not touch the channel of WhatsApp contacts", async () => {
    const contact = makeContact({
      channel: "whatsapp",
      number: "5511900000000"
    });
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(contact as unknown as Contact);

    await UpdateContactService({
      contactData: { name: "Maria", number: "5511911111111" },
      contactId: "12",
      companyId: 2
    });

    expect(contact.update.mock.calls[0][0]).not.toHaveProperty("channel");
  });

  it("UpdateContactService still writes the number of WhatsApp contacts", async () => {
    const contact = makeContact({
      channel: "whatsapp",
      number: "5511900000000"
    });
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(contact as unknown as Contact);

    await UpdateContactService({
      contactData: { name: "Maria", number: "5511911111111" },
      contactId: "12",
      companyId: 2
    });

    expect(contact.update.mock.calls[0][0].number).toBe("5511911111111");
  });

  it("ContactController.update skips CheckContactNumber when no number is sent", async () => {
    const contact = { id: 12, name: "Maria", number: null };
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(makeContact(contact) as unknown as Contact);
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    await updateContactController(
      {
        body: { name: "Maria", email: "maria@example.com" },
        params: { contactId: "12" },
        user: { companyId: 2 }
      } as unknown as Request,
      res
    );

    expect(CheckContactNumber).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  const callUpdate = (body: Record<string, unknown>) => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;
    return {
      res,
      promise: updateContactController(
        {
          body,
          params: { contactId: "12" },
          user: { companyId: 2 }
        } as unknown as Request,
        res
      )
    };
  };

  it("ContactController.update accepts a blank number for an email contact and keeps it null", async () => {
    const contact = makeContact({ channel: "email", number: null });
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(contact as unknown as Contact);

    const { res, promise } = callUpdate({ name: "Maria", number: "" });
    await promise;

    expect(res.status).toHaveBeenCalledWith(200);
    expect(CheckContactNumber).not.toHaveBeenCalled();
    expect(contact.update.mock.calls[0][0]).not.toHaveProperty("number");
    expect((contact as { number?: string | null }).number).toBeNull();
  });

  it("ContactController.update rejects a blank number for a WhatsApp contact with ERR_CHECK_NUMBER", async () => {
    const contact = makeContact({
      channel: "whatsapp",
      number: "5511900000000"
    });
    jest
      .spyOn(Contact, "findOne")
      .mockResolvedValue(contact as unknown as Contact);

    const { promise } = callUpdate({ name: "Maria", number: "" });

    await expect(promise).rejects.toMatchObject({
      message: "ERR_CHECK_NUMBER",
      statusCode: 400
    });
    expect(contact.update).not.toHaveBeenCalled();
  });

  it("ContactController.update still rejects malformed numbers", async () => {
    const { promise } = callUpdate({ name: "Maria", number: "12ab" });

    await expect(promise).rejects.toMatchObject({
      message: "ERR_CHECK_NUMBER"
    });
  });

  it("ContactController.update still checks numbers sent for WhatsApp contacts", async () => {
    (CheckContactNumber as jest.Mock).mockResolvedValue(null);
    jest.spyOn(Contact, "findOne").mockResolvedValue(
      makeContact({
        channel: "whatsapp",
        number: "5511900000000"
      }) as unknown as Contact
    );
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    await updateContactController(
      {
        body: { name: "Maria", number: "5511900000000" },
        params: { contactId: "12" },
        user: { companyId: 2 }
      } as unknown as Request,
      res
    );

    expect(CheckContactNumber).toHaveBeenCalledWith("5511900000000", 2);
  });
});

describe("UpdateTicketService messages by channel", () => {
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
  const wbotSendMessage = jest.fn();
  let tracking: {
    startedAt: null;
    finishedAt: Date | null;
    ratingAt: Date | null;
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
      queueId: 7,
      userId: 3,
      status: "open",
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
      user: { id: 3, name: "Ana" },
      update: jest.fn(),
      reload: jest.fn(),
      ...data
    };
    ticket.update.mockImplementation(async (values: object) => {
      Object.assign(ticket, values);
      return ticket;
    });
    ticket.reload.mockImplementation(async () => ticket);
    return ticket as unknown as Ticket;
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

  // O ticket de e-mail guarda whatsappId NULL, mas o teste mantém uma conexão
  // "conectada" no objeto para provar que a guarda é o canal, não a ausência
  // acidental da conexão.
  const emailTicket = (data: Record<string, unknown> = {}) =>
    makeTicket({
      channel: "email",
      contact: { isGroup: false, disableBot: false, number: null },
      ...data
    });

  it("does not call SendWhatsAppMessage for channel email on close", async () => {
    const result = await run(
      emailTicket(),
      { status: "closed" },
      { userRating: "enabled" }
    );

    expectNoWhatsAppTraffic();
    expect(result.ticket.status).toBe("closed");
    // Com avaliação ligada, o ticket de WhatsApp pararia aqui esperando a nota
    // (ratingAt preenchido e retorno antecipado). No e-mail o fechamento segue.
    expect(tracking.ratingAt).toBeNull();
    expect(tracking.finishedAt).toBeInstanceOf(Date);
  });

  it("waits for the rating on WhatsApp tickets with the same settings", async () => {
    sendWhatsAppMessage.mockResolvedValue({} as never);

    await run(makeTicket({}), { status: "closed" }, { userRating: "enabled" });

    expect(tracking.ratingAt).toBeInstanceOf(Date);
  });

  it("does not call SendWhatsAppMessage for channel email on accept", async () => {
    await run(
      emailTicket({ status: "pending", userId: null, user: null, queueId: 7 }),
      { status: "open", userId: 3 },
      { ticketAcceptedMessage: "Olá, sou {{userName}}" }
    );

    expectNoWhatsAppTraffic();
  });

  it("does not call SendWhatsAppMessage or start the chatbot for channel email on transfer", async () => {
    jest.spyOn(Queue, "findOne").mockResolvedValue({ id: 8 } as Queue);
    await run(
      emailTicket({ status: "pending", userId: null, queueId: 7 }),
      { status: "pending", queueId: 8 },
      { transferMessage: "Você foi transferido" }
    );

    expectNoWhatsAppTraffic();
  });

  it("keeps sending the completion message on baileys WhatsApp tickets", async () => {
    sendWhatsAppMessage.mockResolvedValue({} as never);

    await run(makeTicket({}), { status: "closed" });

    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(verifyMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps sending the completion message on official WhatsApp tickets", async () => {
    sendWhatsAppMessage.mockResolvedValue({} as never);

    await run(
      makeTicket({
        whatsapp: {
          status: "CONNECTED",
          apiMode: "official",
          complationMessage: "Atendimento encerrado"
        }
      }),
      { status: "closed" }
    );

    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(verifyMessage).not.toHaveBeenCalled();
  });

  it("keeps sending the rating request on WhatsApp tickets", async () => {
    sendWhatsAppMessage.mockResolvedValue({} as never);

    await run(makeTicket({}), { status: "closed" }, { userRating: "enabled" });

    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppMessage.mock.calls[0][0].body).toContain("Avalie");
  });
});

describe("CreateTicketService with contacts without phone", () => {
  const showContact = ShowContactService as jest.MockedFunction<
    typeof ShowContactService
  >;

  beforeEach(() => {
    (GetDefaultWhatsApp as jest.Mock).mockResolvedValue({
      id: 6,
      companyId: 2
    });
    (CheckContactOpenTickets as jest.Mock).mockResolvedValue(null);
  });

  it("CreateTicketService rejects a contact without number with ERR_CONTACT_HAS_NO_PHONE", async () => {
    showContact.mockResolvedValue({
      id: 12,
      isGroup: false,
      channel: "email",
      number: null
    } as unknown as Contact);
    const create = jest.spyOn(Ticket, "create").mockResolvedValue({} as never);

    await expect(
      CreateTicketService({ contactId: 12, userId: 1, companyId: 2 })
    ).rejects.toMatchObject({
      message: "ERR_CONTACT_HAS_NO_PHONE",
      statusCode: 400
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("still creates tickets for contacts that have a number", async () => {
    showContact.mockResolvedValue({
      id: 12,
      isGroup: false,
      channel: "whatsapp",
      number: "5511987654321"
    } as unknown as Contact);
    const ticket = {
      id: 31,
      companyId: 2,
      whatsappId: 6,
      userId: 1,
      reload: jest.fn()
    };
    jest.spyOn(Ticket, "create").mockResolvedValue(ticket as never);
    (FindOrCreateATicketTrakingService as jest.Mock).mockResolvedValue({});
    (incrementCounter as jest.Mock).mockResolvedValue(undefined);
    flushSocket();

    const created = await CreateTicketService({
      contactId: 12,
      userId: 1,
      companyId: 2
    });

    expect(created).toBe(ticket);
    expect(Ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 12, whatsappId: 6 })
    );
  });
});
