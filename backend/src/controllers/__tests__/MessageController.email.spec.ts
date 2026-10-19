/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import ShowTicketService from "../../services/TicketServices/ShowTicketService";
import SendEmailService from "../../services/EmailServices/SendEmailService";
import SendWhatsAppMessage from "../../services/WbotServices/SendWhatsAppMessage";
import SendWhatsAppMedia from "../../services/WbotServices/SendWhatsAppMedia";
import GetTicketServiceWindowService from "../../services/TicketServices/TicketServiceWindowService";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import ResolveQuotedMessageService from "../../services/MessageServices/ResolveQuotedMessageService";
import ShowContactService from "../../services/ContactServices/ShowContactService";

jest.mock("../../services/TicketServices/ShowTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/EmailServices/SendEmailService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/WbotServices/SendWhatsAppMessage", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/WbotServices/SendWhatsAppMedia", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/WbotServices/DeleteWhatsAppMessage", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/WbotServices/EditWhatsAppMessage", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/TicketServices/TicketServiceWindowService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock(
  "../../services/MetaWhatsAppServices/SendMetaReactionService",
  () => ({ __esModule: true, default: jest.fn() })
);
jest.mock(
  "../../services/MetaWhatsAppServices/SendTicketTemplateService",
  () => ({ __esModule: true, default: jest.fn() })
);
jest.mock("../../services/MessageServices/ListMessagesService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/MessageServices/ForwardMessageService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/MessageServices/ResolveQuotedMessageService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/ContactServices/ShowContactService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../helpers/SetTicketMessagesAsRead", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../helpers/normalizeMediaCaption", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../libs/wbot", () => ({ getWbot: jest.fn() }));
jest.mock("../../services/WbotServices/wbotMessageListener", () => ({
  verifyMessage: jest.fn()
}));
jest.mock("../../services/WbotServices/getJidOf", () => ({
  getJidOf: jest.fn()
}));
jest.mock("../../services/WbotServices/verifyContact", () => ({
  verifyContact: jest.fn()
}));
jest.mock("../../services/WhatsappGroupServices/GroupAccessService", () => ({
  assertGroupAccess: jest.fn()
}));
jest.mock("../../services/WhatsappGroupServices/GroupUnreadService", () => ({
  markGroupRead: jest.fn()
}));
jest.mock("../../models/Whatsapp", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../models/Queue", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../models/User", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../models/Message", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../models/Contact", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../models/Ticket", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../models/OldMessage", () => ({
  __esModule: true,
  default: jest.fn()
}));

import { store } from "../MessageController";

const res = () => {
  const response: any = {};
  response.send = jest.fn(() => response);
  response.json = jest.fn(() => response);
  response.status = jest.fn(() => response);
  return response as Response;
};

const req = (body: any, files?: any[]) =>
  ({
    params: { ticketId: "90" },
    body,
    files,
    user: { id: "2", companyId: 7, profile: "user" }
  }) as unknown as Request;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("MessageController.store", () => {
  it("MessageController.store routes channel email to SendEmailService", async () => {
    const ticket = {
      id: 90,
      companyId: 7,
      channel: "email",
      isGroup: false,
      // even if an email ticket carried an official connection, the Meta 24h
      // window never applies to email
      whatsapp: { apiMode: "official" }
    };
    (ShowTicketService as jest.Mock).mockResolvedValue(ticket);
    (SendEmailService as jest.Mock).mockResolvedValue({ id: "m-1" });
    const files = [{ path: "/tmp/x", originalname: "x.pdf", size: 1 }];
    const response = res();

    await store(
      req(
        {
          body: "Olá",
          mode: "replyAll",
          to: "a@x.com",
          cc: "b@x.com",
          subject: "Re: Pedido",
          idempotencyKey: "k-1"
        },
        files
      ),
      response
    );

    expect(ShowTicketService).toHaveBeenCalledWith("90", 7);
    expect(SendEmailService).toHaveBeenCalledWith({
      ticket,
      userId: 2,
      mode: "replyAll",
      to: "a@x.com",
      cc: "b@x.com",
      subject: "Re: Pedido",
      body: "Olá",
      files,
      idempotencyKey: "k-1"
    });
    expect(response.json).toHaveBeenCalledWith({ id: "m-1" });
    expect(GetTicketServiceWindowService).not.toHaveBeenCalled();
    expect(SetTicketMessagesAsRead).not.toHaveBeenCalled();
    expect(ResolveQuotedMessageService).not.toHaveBeenCalled();
    expect(SendWhatsAppMessage).not.toHaveBeenCalled();
    expect(SendWhatsAppMedia).not.toHaveBeenCalled();
  });

  it("still blocks official WhatsApp tickets outside the 24h window", async () => {
    const ticket = {
      id: 90,
      companyId: 7,
      channel: "whatsapp",
      isGroup: false,
      contactId: 11,
      whatsapp: { apiMode: "official" }
    };
    (ShowTicketService as jest.Mock).mockResolvedValue(ticket);
    (ResolveQuotedMessageService as jest.Mock).mockResolvedValue(null);
    (GetTicketServiceWindowService as jest.Mock).mockResolvedValue({
      open: false
    });

    await expect(store(req({ body: "Oi" }), res())).rejects.toMatchObject({
      message: "ERR_META_WINDOW_CLOSED",
      statusCode: 403
    });
    expect(GetTicketServiceWindowService).toHaveBeenCalledWith(ticket);
    expect(SendWhatsAppMessage).not.toHaveBeenCalled();
    expect(SendEmailService).not.toHaveBeenCalled();
  });

  it("keeps WhatsApp tickets on the WhatsApp path", async () => {
    const ticket = {
      id: 90,
      companyId: 7,
      channel: "whatsapp",
      isGroup: false,
      contactId: 11,
      whatsapp: { apiMode: "baileys" }
    };
    (ShowTicketService as jest.Mock).mockResolvedValue(ticket);
    (ShowContactService as jest.Mock).mockResolvedValue({
      number: "5511999999999@lid",
      whatsappLidMap: null
    });
    (ResolveQuotedMessageService as jest.Mock).mockResolvedValue(null);
    const response = res();

    await store(req({ body: "Oi" }), response);

    expect(SendEmailService).not.toHaveBeenCalled();
    expect(SendWhatsAppMessage).toHaveBeenCalledWith({
      body: "Oi",
      ticket,
      userId: 2,
      quotedMsg: null
    });
    expect(response.send).toHaveBeenCalled();
  });
});
