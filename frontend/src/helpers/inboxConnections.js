import { i18n } from "../translate/i18n";
import { CONNECTION_PROVIDERS, emailProviderKey } from "./emailConnections";

// "Filtrar por conexão" select of the inbox (design "Atendimentos –
// Multicanal"). Values are "all", "whatsapp:<id>" or "email:<id>".
export const ALL_CONNECTIONS = "all";

const providerLabel = key =>
  i18n.t(
    `emailChannel.connections.providers.${CONNECTION_PROVIDERS[key].labelKey}`
  );

// Legacy rows have no channel; anything else (e.g. facebook/instagram) is
// not a WhatsApp connection and has no inbox filter here.
const isWhatsAppConnection = whatsApp =>
  !whatsApp?.channel || whatsApp.channel === "whatsapp";

/**
 * Options of the connection select, in the design's "Provider · Name" form,
 * limited to the channel picked in the channel chips ("all" | "whatsapp" |
 * "email"). Email accounts are listed only when given (email channel on).
 */
export const connectionOptions = ({
  whatsApps = [],
  emailAccounts = [],
  channel = "all"
}) => {
  const options = [
    {
      value: ALL_CONNECTIONS,
      label: i18n.t("emailChannel.inbox.filters.allConnections")
    }
  ];
  if (channel === "all" || channel === "whatsapp") {
    (Array.isArray(whatsApps) ? whatsApps : [])
      .filter(isWhatsAppConnection)
      .forEach(whatsApp =>
        options.push({
          value: `whatsapp:${whatsApp.id}`,
          label: `${providerLabel(
            whatsApp.apiMode === "official" ? "waapi" : "wa"
          )} · ${whatsApp.name}`
        })
      );
  }
  if (channel === "all" || channel === "email") {
    // disconnected accounts stay listed: their tickets are still there
    (Array.isArray(emailAccounts) ? emailAccounts : [])
      .filter(account => account?.id)
      .forEach(account =>
        options.push({
          value: `email:${account.id}`,
          label: `${providerLabel(emailProviderKey(account))} · ${
            account.name || account.address
          }`
        })
      );
  }
  return options;
};

/**
 * GET /tickets params for a select value: `whatsappId` or `emailAccountId`,
 * or nothing for "all" / an unknown value.
 */
export const connectionParams = value => {
  const match = /^(whatsapp|email):(\d+)$/.exec(String(value || ""));
  if (!match) return {};
  const id = Number(match[2]);
  return match[1] === "whatsapp" ? { whatsappId: id } : { emailAccountId: id };
};

// Same filter on a ticket that arrives through the socket.
export const ticketMatchesConnection = (ticket, params) => {
  if (params?.whatsappId) return ticket?.whatsappId === params.whatsappId;
  if (params?.emailAccountId)
    return ticket?.emailAccountId === params.emailAccountId;
  return true;
};

// The WhatsApp chip means "every ticket that is not email": legacy tickets
// have no channel, and nothing but email uses another Ticket.channel today.
export const ticketMatchesChannel = (ticket, channel) => {
  if (!channel) return true;
  const ticketChannel = ticket?.channel || "whatsapp";
  if (channel === "whatsapp") return ticketChannel !== "email";
  return ticketChannel === channel;
};
