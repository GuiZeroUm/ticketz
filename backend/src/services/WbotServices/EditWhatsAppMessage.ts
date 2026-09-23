import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Message from "../../models/Message";
import OldMessage from "../../models/OldMessage";
import Ticket from "../../models/Ticket";

import formatBody from "../../helpers/Mustache";
import User from "../../models/User";
import Contact from "../../models/Contact";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";

interface Request {
  messageId: string;
  companyId: number;
  userId?: number;
  body: string;
}

const EditWhatsAppMessage = async ({
  messageId,
  companyId,
  userId,
  body
}: Request): Promise<{ ticketId: number; message: Message }> => {
  const message = await Message.findOne({
    where: {
      id: messageId,
      companyId
    },
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: [
          {
            model: Contact,
            as: "contact",
            include: ["tags", "extraInfo"]
          },
          "queue",
          "whatsapp",
          "user",
          "tags"
        ]
      }
    ]
  });

  const user = userId && (await User.findByPk(userId));

  if (!message) {
    throw new AppError("No message found with this ID.");
  }

  const { ticket } = message;

  if (ticket.whatsapp?.apiMode === "official") {
    throw new AppError("ERR_WAPP_OFFICIAL_MODE_NOT_SUPPORTED", 400);
  }

  const wbot = await GetTicketWbot(ticket);

  const msg = JSON.parse(message.dataJson);
  const formattedBody = formatBody(body, ticket, user);

  try {
    await wbot.sendMessage(
      message.remoteJid,
      {
        text: formattedBody,
        edit: msg.key
      },
      {}
    );

    const oldMessage = {
      messageId,
      body: message.body,
      ticketId: message.ticketId
    };

    await OldMessage.upsert(oldMessage);

    await message.update({ body: formattedBody, isEdited: true });

    await ticket.update({ lastMessage: formattedBody });

    await websocketUpdateTicket(ticket);

    const savedMessage = await Message.findOne({
      where: {
        id: messageId,
        companyId
      },
      include: [
        {
          model: Ticket,
          as: "ticket",
          include: ["contact"]
        },
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"],
          where: {
            companyId
          },
          required: false
        },
        {
          model: OldMessage,
          as: "oldMessages",
          where: {
            ticketId: message.ticketId
          },
          required: false
        }
      ]
    });

    return { ticketId: savedMessage.ticketId, message: savedMessage };
  } catch (err) {
    console.log(err);
    throw new AppError("ERR_EDITING_WAPP_MSG");
  }
};

export default EditWhatsAppMessage;
