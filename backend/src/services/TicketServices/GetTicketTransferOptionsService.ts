import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import EmailAccount from "../../models/EmailAccount";
import ShowTicketService from "./ShowTicketService";

interface Request {
  ticketId: number | string;
  companyId: number;
}

interface QueueOption {
  id: number;
  name: string;
  color: string;
}

interface ConnectionOption {
  id: number;
  name: string;
  channel: string;
  status: string;
  isCurrent: boolean;
  queues: QueueOption[];
}

interface Response {
  currentWhatsappId: number;
  isGroup: boolean;
  connections: ConnectionOption[];
}

// Ticket de e-mail não tem conexão WhatsApp. A conta de e-mail faz o papel da
// única "conexão" para a tela de transferência continuar igual; qualquer fila
// da empresa é destino válido. O id enviado de volta como whatsappId é ignorado
// pelo UpdateTicketService nos tickets de e-mail.
const getEmailTransferOptions = async (
  ticket: Ticket,
  companyId: number
): Promise<Response> => {
  const [account, queues] = await Promise.all([
    ticket.emailAccountId
      ? EmailAccount.findOne({
          where: { id: ticket.emailAccountId, companyId },
          attributes: ["id", "name", "address", "status"]
        })
      : null,
    Queue.findAll({
      where: { companyId },
      attributes: ["id", "name", "color", "order"],
      order: [
        ["order", "ASC"],
        ["name", "ASC"]
      ]
    })
  ]);

  return {
    currentWhatsappId: ticket.emailAccountId,
    isGroup: false,
    connections: account
      ? [
          {
            id: account.id,
            name: account.name || account.address,
            channel: "email",
            status: account.status,
            isCurrent: true,
            queues: queues.map(queue => ({
              id: queue.id,
              name: queue.name,
              color: queue.color
            }))
          }
        ]
      : []
  };
};

const GetTicketTransferOptionsService = async ({
  ticketId,
  companyId
}: Request): Promise<Response> => {
  const ticket = await ShowTicketService(ticketId, companyId);
  const channel = ticket.channel || "whatsapp";

  if (channel === "email") {
    return getEmailTransferOptions(ticket, companyId);
  }

  const [connections, queues] = await Promise.all([
    Whatsapp.findAll({
      where: { companyId, channel },
      attributes: ["id", "name", "channel", "status", "isDefault"],
      order: [
        ["isDefault", "DESC"],
        ["name", "ASC"]
      ]
    }),
    Queue.findAll({
      where: { companyId },
      attributes: ["id", "name", "color", "order"],
      include: [
        {
          model: Whatsapp,
          as: "whatsapps",
          attributes: ["id"],
          through: { attributes: [] }
        }
      ],
      order: [
        ["order", "ASC"],
        ["name", "ASC"]
      ]
    })
  ]);

  const options = connections.map(connection => {
    const availableQueues = queues
      .filter(queue => {
        // Filas sem vínculo são legado e continuam disponíveis em qualquer
        // conexão. Assim o recurso pode ser implantado sem alterar os dados.
        if (!queue.whatsapps?.length) return true;
        return queue.whatsapps.some(whatsapp => whatsapp.id === connection.id);
      })
      .map(queue => ({
        id: queue.id,
        name: queue.name,
        color: queue.color
      }));

    return {
      id: connection.id,
      name: connection.name,
      channel: connection.channel,
      status: connection.status,
      isCurrent: connection.id === ticket.whatsappId,
      queues: availableQueues
    };
  });

  // Um ticket antigo pode apontar para uma conexão removida do filtro de canal.
  // Nesse caso não inventamos destino: a tela mantém o fluxo sem alternativas.
  const orderedOptions = options.sort((left, right) => {
    if (left.isCurrent) return -1;
    if (right.isCurrent) return 1;
    return String(left.name || "").localeCompare(String(right.name || ""));
  });

  return {
    currentWhatsappId: ticket.whatsappId,
    isGroup: !!(ticket.isGroup || ticket.contact?.isGroup),
    connections: orderedOptions
  };
};

export default GetTicketTransferOptionsService;
