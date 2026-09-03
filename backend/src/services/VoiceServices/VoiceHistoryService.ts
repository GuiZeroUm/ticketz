import moment from "moment";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import TicketTraking from "../../models/TicketTraking";
import VoiceCall from "../../models/VoiceCall";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { incrementCounter } from "../CounterServices/IncrementCounter";
import ShowTicketService from "../TicketServices/ShowTicketService";

const durationLabel = (seconds: number): string => {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0"
      )}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(
        2,
        "0"
      )}`;
};

const voiceMessageId = (call: VoiceCall, suffix: string): string =>
  `voice-${call.id}-${suffix}`;

const emitVoiceTicketUpdate = (ticket: Ticket, oldStatus?: string): void => {
  let emitter = getIO()
    .to(ticket.id.toString())
    .to(`user-${ticket.userId}`)
    .to(`queue-${ticket.queueId}-notification`)
    .to(`queue-${ticket.queueId}-${ticket.status}`)
    .to(`company-${ticket.companyId}-notification`)
    .to(`company-${ticket.companyId}-${ticket.status}`);
  if (oldStatus) {
    emitter = emitter
      .to(`company-${ticket.companyId}-${oldStatus}`)
      .to(`queue-${ticket.queueId}-${oldStatus}`);
  }
  emitter.emit(`company-${ticket.companyId}-ticket`, {
    action: "update",
    ticket
  });
};

export const startVoiceHistory = async (call: VoiceCall): Promise<void> => {
  if (!call.contactId || call.ticketId) return;
  const ticket = await Ticket.create({
    contactId: call.contactId,
    companyId: call.companyId,
    queueId: call.queueId,
    whatsappId: call.whatsappId,
    userId: call.userId,
    status: "open",
    channel: "voice",
    unreadMessages: 0,
    lastMessage: "Ligação",
    isGroup: false
  });
  const startedAt = call.acceptedAt || new Date();
  await TicketTraking.create({
    ticketId: ticket.id,
    companyId: call.companyId,
    whatsappId: call.whatsappId,
    userId: call.userId,
    queuedAt: call.startedAt,
    startedAt,
    waitTime: moment(startedAt).diff(moment(call.startedAt), "seconds")
  });
  await call.update({ ticketId: ticket.id });
  await incrementCounter(call.companyId, "ticket-create");
  await incrementCounter(call.companyId, "ticket-accept");
  await CreateMessageService({
    companyId: call.companyId,
    messageData: {
      id: voiceMessageId(call, "summary"),
      ticketId: ticket.id,
      contactId: call.contactId,
      queueId: call.queueId,
      channel: "voice",
      fromMe: true,
      read: true,
      ack: 2,
      mediaType: "voice_call",
      body: "📞 Ligação em andamento"
    }
  });
};

export const finishVoiceHistory = async (call: VoiceCall): Promise<void> => {
  if (!call.ticketId) return;
  const ticket = await Ticket.findOne({
    where: { id: call.ticketId, companyId: call.companyId }
  });
  if (!ticket) return;
  const duration = durationLabel(call.durationSeconds);
  const stateLabel = call.state === "ended" ? "finalizada" : "interrompida";
  const body = `📞 Ligação ${stateLabel} • ${duration}`;
  await ticket.update({ lastMessage: `Ligação • ${duration}` });
  await CreateMessageService({
    companyId: call.companyId,
    messageData: {
      id: voiceMessageId(call, "summary"),
      ticketId: ticket.id,
      contactId: call.contactId,
      queueId: call.queueId,
      channel: "voice",
      fromMe: true,
      read: true,
      ack: 2,
      mediaType: "voice_call",
      body
    }
  });

  const endedAt = call.endedAt || new Date();
  const tracking = await TicketTraking.findOne({
    where: { ticketId: ticket.id, finishedAt: null },
    order: [["id", "DESC"]]
  });
  if (tracking) {
    await tracking.update({
      finishedAt: endedAt,
      serviceTime: call.durationSeconds,
      userId: call.userId
    });
  }
  const oldStatus = ticket.status;
  await ticket.update({ status: "closed" });
  await incrementCounter(call.companyId, "ticket-close");
  const hydrated = await ShowTicketService(ticket.id, call.companyId);
  getIO()
    .to(`company-${call.companyId}-${oldStatus}`)
    .to(`queue-${ticket.queueId}-${oldStatus}`)
    .to(`user-${ticket.userId}`)
    .emit(`company-${call.companyId}-ticket`, {
      action: "removeFromList",
      ticketId: ticket.id
    });
  emitVoiceTicketUpdate(hydrated, oldStatus);
};

export { durationLabel, voiceMessageId };
