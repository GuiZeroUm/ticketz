import { Op } from "sequelize";
import { isWebPushConfigured } from "../../config/webPush";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import GroupQueue from "../../models/GroupQueue";
import Message from "../../models/Message";
import User from "../../models/User";
import UserQueue from "../../models/UserQueue";
import UserSocketSession from "../../models/UserSocketSession";
import { logger } from "../../utils/logger";
import SendPushNotificationService from "./SendPushNotificationService";

const MAX_BODY_LENGTH = 180;

const listCompanyAdminIds = async (companyId: number): Promise<number[]> => {
  const admins = await User.findAll({
    where: { companyId, profile: "admin" },
    attributes: ["id"]
  });
  return admins.map(admin => admin.id);
};

const listQueueUserIds = async (
  companyId: number,
  queueIds: number[]
): Promise<number[]> => {
  if (!queueIds.length) {
    return [];
  }
  const links = await UserQueue.findAll({
    where: { queueId: { [Op.in]: queueIds } },
    attributes: ["userId"]
  });
  if (!links.length) {
    return [];
  }
  // UserQueue não guarda companyId, então o filtro por empresa vem do User.
  const users = await User.findAll({
    where: {
      companyId,
      id: { [Op.in]: links.map(link => link.userId) }
    },
    attributes: ["id"]
  });
  return users.map(user => user.id);
};

// Espelha o filtro que o NotificationsPopOver aplica no frontend: atribuído ->
// só o responsável; sem responsável -> a fila; sem responsável e sem fila ->
// os admins. Manter os dois lados iguais evita push de ticket que o usuário
// nem veria na tela.
const resolveRecipients = async (message: Message): Promise<number[]> => {
  const { ticket } = message;

  if (ticket.isGroup && ticket.contact?.groupMode !== "ticket") {
    const groupQueues = await GroupQueue.findAll({
      where: { groupContactId: ticket.contactId },
      attributes: ["queueId"]
    });
    const queueUserIds = await listQueueUserIds(
      message.companyId,
      groupQueues.map(item => item.queueId)
    );
    const adminIds = await listCompanyAdminIds(message.companyId);
    return [...new Set([...queueUserIds, ...adminIds])];
  }

  if (ticket.userId) {
    return [ticket.userId];
  }

  if (ticket.queueId) {
    return listQueueUserIds(message.companyId, [ticket.queueId]);
  }

  return listCompanyAdminIds(message.companyId);
};

// Quem está com o socket conectado já recebeu o alerta pelo websocket. Mandar
// push para essas pessoas faria o aparelho tocar duas vezes pela mesma
// mensagem. O ciclo de vida da sessão é confiável: o boot do servidor zera
// todas, o connect cria e o disconnect desativa.
const filterOfflineUserIds = async (userIds: number[]): Promise<number[]> => {
  const sessions = await UserSocketSession.findAll({
    where: { userId: { [Op.in]: userIds }, active: true },
    attributes: ["userId"]
  });
  const onlineIds = new Set(sessions.map(session => session.userId));
  return userIds.filter(userId => !onlineIds.has(userId));
};

const buildBody = (message: Message): string => {
  if (message.body?.startsWith('{"ticketzvCard"')) {
    return "🪪 Contato";
  }
  if (!message.body && message.mediaType) {
    return "📎 Anexo";
  }
  const body = message.body || "";
  return body.length > MAX_BODY_LENGTH
    ? `${body.slice(0, MAX_BODY_LENGTH)}…`
    : body;
};

const NotifyNewMessageService = async (message: Message): Promise<void> => {
  if (!isWebPushConfigured()) {
    return;
  }

  // Mensagem enviada pelo próprio atendente ou já lida não gera notificação,
  // igual ao que o frontend faz antes de chamar handleNotifications.
  if (message.fromMe || message.read) {
    return;
  }

  const { ticket } = message;
  if (!ticket) {
    return;
  }

  try {
    if (ticket.isGroup) {
      const soundGroupNotifications = await GetCompanySetting(
        message.companyId,
        "soundGroupNotifications",
        "disabled"
      );
      if (soundGroupNotifications !== "enabled") {
        return;
      }
    }

    const recipientIds = await resolveRecipients(message);
    if (!recipientIds.length) {
      return;
    }

    const userIds = await filterOfflineUserIds(recipientIds);
    if (!userIds.length) {
      return;
    }

    await SendPushNotificationService({
      userIds,
      companyId: message.companyId,
      payload: {
        title: `Mensagem de ${ticket.contact?.name || "contato"}`,
        body: buildBody(message),
        icon: ticket.contact?.profilePicUrl || undefined,
        tag: String(ticket.id),
        url: `/tickets/${ticket.uuid}`
      }
    });
  } catch (error) {
    // Notificação é acessório: uma falha aqui não pode derrubar a criação da
    // mensagem, que já foi persistida e emitida no websocket.
    logger.warn(
      { ticket: message.ticketId, error: error?.message },
      "falha ao notificar nova mensagem por push"
    );
  }
};

export default NotifyNewMessageService;
