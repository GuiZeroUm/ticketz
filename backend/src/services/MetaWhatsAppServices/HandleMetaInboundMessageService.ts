import mime from "mime-types";
import Whatsapp from "../../models/Whatsapp";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketServiceMeta from "../TicketServices/FindOrCreateTicketServiceMeta";
import CreateMessageService from "../MessageServices/CreateMessageService";
import saveMediaToFile from "../../helpers/saveMediaFile";
import { logger } from "../../utils/logger";
import DownloadMetaMediaService from "./DownloadMetaMediaService";

interface MetaContact {
  profile?: { name?: string };
  wa_id: string;
}

interface MetaMediaPayload {
  id: string;
  mime_type?: string;
  filename?: string;
  caption?: string;
  voice?: boolean;
}

interface MetaInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: MetaMediaPayload;
  audio?: MetaMediaPayload;
  video?: MetaMediaPayload;
  document?: MetaMediaPayload;
  sticker?: MetaMediaPayload;
}

const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"];

// Recebe uma mensagem entrante do payload do webhook Cloud API: texto e as
// midias que a Meta entrega por id (baixadas na hora, ver
// DownloadMetaMediaService).
const HandleMetaInboundMessageService = async (
  whatsapp: Whatsapp,
  metaContact: MetaContact | undefined,
  message: MetaInboundMessage
): Promise<void> => {
  const isMedia = MEDIA_TYPES.includes(message.type);

  if (message.type !== "text" && !isMedia) {
    logger.info(
      { whatsappId: whatsapp.id, type: message.type },
      "Ignoring unsupported Meta inbound message type"
    );
    return;
  }

  const contact = await CreateOrUpdateContactService({
    name: metaContact?.profile?.name || message.from,
    number: message.from,
    companyId: whatsapp.companyId,
    channel: "whatsapp"
  });

  const ticket = await FindOrCreateTicketServiceMeta(
    contact,
    whatsapp.id,
    1,
    whatsapp.companyId,
    "whatsapp"
  );

  const payload = isMedia
    ? (message[message.type as keyof MetaInboundMessage] as MetaMediaPayload)
    : undefined;

  let body = message.text?.body || payload?.caption || "";
  let media: { mediaUrl: string; mimetype: string; filename: string } | null =
    null;

  if (payload?.id) {
    const downloaded = await DownloadMetaMediaService(whatsapp, payload.id);
    const mimetype = payload.mime_type?.split(";")[0] || downloaded.mimetype;
    const filename =
      payload.filename ||
      `${message.id}.${mime.extension(mimetype) || "bin"}`;

    media = {
      mediaUrl: await saveMediaToFile(
        { data: downloaded.content, mimetype, filename },
        { destination: ticket }
      ),
      mimetype,
      filename
    };

    if (!body) {
      body = filename;
    }
  }

  const dataJson: Record<string, unknown> = {
    wamid: message.id,
    source: "meta-cloud-api"
  };

  if (media) {
    dataJson.mimetype = media.mimetype;
    // Mesmo contrato do envio: o MessagesList precisa do documentMessage pra
    // renderizar previa e botao de download em vez de um video quebrado.
    if (message.type === "document") {
      dataJson.message = {
        documentMessage: {
          fileName: media.filename,
          mimetype: media.mimetype
        }
      };
    }
    if (message.type === "sticker") {
      dataJson.message = { stickerMessage: { mimetype: media.mimetype } };
    }
  }

  const messageData = {
    id: message.id,
    ticketId: ticket.id,
    contactId: contact.id,
    body,
    fromMe: false,
    read: false,
    ack: 2,
    ...(media
      ? {
          mediaUrl: media.mediaUrl,
          mediaType: media.mimetype.split("/")[0]
        }
      : {}),
    dataJson: JSON.stringify(dataJson)
  };

  await CreateMessageService({ messageData, companyId: whatsapp.companyId });

  await ticket.update({
    lastMessage: (media ? `📎 ${media.filename}` : body)
      .substring(0, 255)
      .replace(/\n/g, " "),
    ...(ticket.status === "closed" ? { status: "pending" } : {})
  });
};

export default HandleMetaInboundMessageService;
