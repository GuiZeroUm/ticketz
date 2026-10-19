import React, { useContext, useState } from "react";
import { useTheme } from "@material-ui/core/styles";
import { useHistory, useParams } from "react-router-dom";
import { parseISO } from "date-fns";
import {
  UserRound,
  Layers,
  Smartphone,
  Bot,
  UsersRound,
  MessageCircle
} from "lucide-react";
import { Check, Eye, X } from "../AnimatedIcon";
import { v4 as uuidv4 } from "uuid";
import WhatsMarked from "react-whatsmarked";
import AvatarContato from "../AvatarContato";
import TagsLine from "../TagsLine";
import TicketMessagesDialog from "../TicketMessagesDialog";
import { BotaoIcone, useIdentidade } from "../interface";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import { i18n } from "../../translate/i18n";
import { formatWhatsappContactName } from "../../helpers/formatWhatsappDisplay";
import pastRelativeDate from "../../helpers/pastRelativeDate";
import { corAvatarContato } from "../../helpers/coresAvatar";
import { getInitials } from "../../helpers/getInitials";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import {
  CONNECTION_PROVIDERS,
  ChannelIcon,
  emailProviderKey,
  providerColors
} from "../../helpers/emailConnections";
import { isEmailTicket, ti } from "../../helpers/emailInbox";
import "./ticket-card.css";

export default function TicketListItemCustom({
  ticket,
  setTabOpen,
  groupActionButtons
}) {
  const history = useHistory();
  const { ticketId } = useParams();
  const { user } = useContext(AuthContext);
  const { setCurrentTicket } = useContext(TicketsContext);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const identidade = useIdentidade();
  const group = ticket.isGroup && ticket.contact?.groupMode !== "ticket";
  const ownTicket =
    Number(ticket.user?.id || ticket.userId) === Number(user?.id);
  const canPreview =
    user?.profile === "admin" || ticket.status === "pending" || ownTicket;
  const canClose =
    user?.profile === "admin" || ticket.status === "pending" || ownTicket;
  const actions = !group && (groupActionButtons || !ticket.isGroup);
  const selected =
    ticketId === ticket.uuid || String(ticketId) === String(ticket.id);
  const name = formatWhatsappContactName(ticket.contact, ticket);
  const last = typeof ticket.lastMessage === "string" ? ticket.lastMessage : "";
  const prefix = group
    ? ticket.lastSenderFromMe
      ? `${i18n.t("whatsappGroups.you")}: `
      : ticket.lastSenderName
        ? `${ticket.lastSenderName}: `
        : ""
    : "";
  const message = last.startsWith('{"ticketzvCard"')
    ? "🪪"
    : last.includes("data:image/png;base64")
      ? i18n.t("chatExperience.location")
      : last.split("\n")[0];
  const presence = ["composing", "recording"].includes(ticket.presence);
  const theme = useTheme();
  const email = isEmailTicket(ticket);
  const emailProvider = email
    ? CONNECTION_PROVIDERS[emailProviderKey(ticket.emailAccount)]
    : null;
  const emailColor = email ? providerColors(theme, emailProvider).color : null;
  const subject = email ? ticket.subject || ti("noSubject") : "";
  // Email tickets keep the subject as lastMessage; avoid showing it twice.
  const emailPreview = email && last.trim() !== subject.trim() ? message : "";

  const updateStatus = async status => {
    if (busy) return;
    setBusy(true);
    try {
      await api.put(`/tickets/${ticket.id}`, {
        status,
        userId: user?.id,
        ...(status === "closed" ? { justClose: true } : {})
      });
      if (status === "open") {
        history.push(`/tickets/${ticket.uuid}`);
        setTabOpen?.("open");
      } else if (selected) history.push("/tickets/");
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={`ticket-card ${selected ? "is-selected" : ""}`}
      style={identidade}
      data-testid={`ticket-card-${ticket.id}`}
    >
      <TicketMessagesDialog
        open={preview}
        handleClose={() => setPreview(false)}
        ticketId={ticket.id}
      />
      <button
        type="button"
        className="ticket-card-open"
        aria-label={name}
        aria-current={selected ? "page" : undefined}
        onClick={() => {
          if (ticket.status !== "pending" || !actions)
            setCurrentTicket({
              id: ticket.id,
              uuid: ticket.uuid,
              code: uuidv4()
            });
        }}
      >
        {email ? (
          <span className="ticket-card-avatar">
            <AvatarContato
              contact={ticket.contact}
              style={{
                backgroundColor: corAvatarContato(ticket.contact),
                color: "white",
                fontSize: 13
              }}
            >
              {getInitials(ticket.contact?.name || "")}
            </AvatarContato>
            <span
              className="ticket-card-channel-badge"
              style={{ background: emailColor }}
              aria-hidden="true"
            >
              <ChannelIcon
                name={emailProvider.icon}
                size={10}
                strokeWidth={2.6}
              />
            </span>
          </span>
        ) : (
          <AvatarContato
            contact={ticket.contact}
            style={{
              backgroundColor: corAvatarContato(ticket.contact),
              color: "white",
              fontSize: 13
            }}
          >
            {getInitials(ticket.contact?.name || "")}
          </AvatarContato>
        )}
        <span className="ticket-card-content">
          <span className="ticket-card-heading">
            <strong>
              {group ? (
                <UsersRound size={14} />
              ) : email ? (
                <ChannelIcon name="mail" size={14} strokeWidth={2} />
              ) : (
                <MessageCircle size={14} />
              )}
              <span>{name}</span>
            </strong>
            {last && ticket.updatedAt && (
              <time dateTime={ticket.updatedAt}>
                {pastRelativeDate(parseISO(ticket.updatedAt))}
              </time>
            )}
          </span>
          {email && (
            <span className="ticket-card-subject" title={subject}>
              {subject}
            </span>
          )}
          <span className="ticket-card-preview">
            <span className={presence ? "ticket-card-presence" : ""}>
              {presence ? (
                i18n.t(`presence.${ticket.presence}`)
              ) : email ? (
                emailPreview
              ) : (
                <WhatsMarked oneline>
                  {`${prefix}${message}` || i18n.t("chatExperience.noMessage")}
                </WhatsMarked>
              )}
            </span>
            {ticket.unreadMessages > 0 && (
              <b
                aria-label={i18n.t("chatExperience.unread", {
                  count: ticket.unreadMessages
                })}
              >
                {ticket.unreadMessages > 99 ? "99+" : ticket.unreadMessages}
              </b>
            )}
          </span>
        </span>
      </button>
      {!group && (
        <div className="ticket-card-details">
          <TagsLine ticket={ticket} limit={3} />
          <div className="ticket-card-footer">
            <div className="ticket-card-assignment">
              {ticket.user?.name && ticket.status !== "pending" && (
                <span title={ticket.user.name}>
                  <UserRound size={12} />
                  {ticket.user.name}
                </span>
              )}
              {email && ticket.emailAccount?.name && (
                <span
                  title={
                    ticket.emailAccount.address || ticket.emailAccount.name
                  }
                  style={{ color: emailColor, fontWeight: 600 }}
                >
                  <ChannelIcon
                    name={emailProvider.icon}
                    size={12}
                    strokeWidth={2}
                  />
                  {ticket.emailAccount.name}
                </span>
              )}
              {ticket.whatsapp?.name && (
                <span title={ticket.whatsapp.name}>
                  <Smartphone size={12} />
                  {ticket.whatsapp.name}
                </span>
              )}
              <span title={ticket.queue?.name || i18n.t("conversa.semFila")}>
                <Layers size={12} />
                {ticket.queue?.name || i18n.t("conversa.semFila")}
              </span>
              {ticket.chatbot && (
                <span title="Chatbot">
                  <Bot size={12} />
                  Chatbot
                </span>
              )}
              {ticket.status === "closed" && (
                <span>{i18n.t("common.closed")}</span>
              )}
            </div>
            {actions && (
              <div className="ticket-card-actions">
                {ticket.status === "pending" && (
                  <BotaoIcone
                    titulo={i18n.t("ticketsList.buttons.accept")}
                    disabled={busy}
                    onClick={() => updateStatus("open")}
                  >
                    <Check size={16} />
                  </BotaoIcone>
                )}
                {canPreview && (
                  <BotaoIcone
                    titulo={i18n.t("chatExperience.preview")}
                    onClick={() => setPreview(true)}
                  >
                    <Eye size={16} />
                  </BotaoIcone>
                )}
                {["open", "pending"].includes(ticket.status) && canClose && (
                  <BotaoIcone
                    titulo={i18n.t("chatExperience.close")}
                    disabled={busy}
                    onClick={() => updateStatus("closed")}
                  >
                    <X size={16} />
                  </BotaoIcone>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
