import AppError from "../../errors/AppError";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import Ticket from "../../models/Ticket";
import ShowContactService from "../ContactServices/ShowContactService";
import { getIO } from "../../libs/socket";
import FindOrCreateATicketTrakingService from "./FindOrCreateATicketTrakingService";
import Contact from "../../models/Contact";
import { incrementCounter } from "../CounterServices/IncrementCounter";
import Whatsapp from "../../models/Whatsapp";
import sequelize from "../../database";
import { Op } from "sequelize";
import { isActiveTicketUniqueConflict } from "./ActiveTicketConflict";

interface Request {
  contactId: number;
  userId: number;
  companyId: number;
  queueId?: number;
  whatsappId?: number;
}

const CreateTicketService = async ({
  contactId,
  userId,
  queueId,
  companyId,
  whatsappId
}: Request): Promise<Ticket> => {
  const defaultWhatsapp = whatsappId
    ? await Whatsapp.findOne({ where: { id: whatsappId, companyId } })
    : await GetDefaultWhatsApp(companyId);
  if (!defaultWhatsapp) throw new AppError("ERR_WAPP_NOT_FOUND");

  const include = [
    {
      model: Contact,
      as: "contact",
      include: ["tags", "extraInfo"]
    },
    "queue",
    {
      model: Whatsapp,
      as: "whatsapp",
      attributes: { exclude: ["metaAccessToken"] }
    },
    "user",
    "tags"
  ];

  const { isGroup } = await ShowContactService(contactId, companyId);
  const createOrFind = () =>
    sequelize.transaction(async transaction => {
      await sequelize.query(
        "SELECT pg_advisory_xact_lock(:companyId, :contactId)",
        { replacements: { companyId, contactId }, transaction }
      );

      const existing = await Ticket.findOne({
        where: {
          contactId,
          companyId,
          whatsappId: defaultWhatsapp.id,
          status: { [Op.in]: ["open", "pending"] }
        },
        transaction
      });
      if (existing) {
        if (existing.status === "open" && existing.userId === userId) {
          return { ticket: existing, created: false };
        }
        throw new AppError("ERR_OTHER_OPEN_TICKET");
      }

      const createdTicket = await Ticket.create(
        {
          contactId,
          companyId,
          queueId,
          whatsappId: defaultWhatsapp.id,
          status: "open",
          isGroup,
          userId
        },
        { transaction }
      );
      await FindOrCreateATicketTrakingService({
        ticketId: createdTicket.id,
        companyId,
        whatsappId: createdTicket.whatsappId,
        userId,
        transaction
      });
      return { ticket: createdTicket, created: true };
    });
  let outcome: Awaited<ReturnType<typeof createOrFind>>;
  try {
    outcome = await createOrFind();
  } catch (error) {
    if (!isActiveTicketUniqueConflict(error)) throw error;
    try {
      outcome = await createOrFind();
    } catch (retryError) {
      if (isActiveTicketUniqueConflict(retryError)) {
        throw new AppError("ERR_OTHER_OPEN_TICKET");
      }
      throw retryError;
    }
  }
  const { ticket, created } = outcome;

  if (!ticket) {
    throw new AppError("ERR_CREATING_TICKET");
  }

  if (created) incrementCounter(ticket.companyId, "ticket-create");

  await ticket.reload({
    include
  });

  const io = getIO();

  io.to(ticket.id.toString()).emit("ticket", {
    action: "update",
    ticket
  });

  return ticket;
};

export default CreateTicketService;
