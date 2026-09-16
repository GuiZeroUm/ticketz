import fs from "fs";
import mime from "mime-types";
import iconv from "iconv-lite";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import saveMediaToFile from "../../helpers/saveMediaFile";
import { logger } from "../../utils/logger";
import { getMetaGraphApiClient, withAuth } from "./MetaGraphApiClient";
import PersistMetaOutboundMessageService from "./PersistMetaOutboundMessageService";
import { MetaSentMessage } from "./SendMetaTextMessageService";

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  connection: Whatsapp;
  caption?: string;
}

export type MetaMediaKind = "image" | "audio" | "video" | "document";

const MEGABYTE = 1024 * 1024;

// Formatos e limites que a Cloud API aceita por tipo. Qualquer mimetype fora
// dessas listas vai como documento, o unico tipo sem restricao de formato -
// mandar um webp como "image", por exemplo, a Meta recusa.
const KINDS: { kind: MetaMediaKind; mimetypes: string[]; limit: number }[] = [
  { kind: "image", mimetypes: ["image/jpeg", "image/png"], limit: 5 * MEGABYTE },
  {
    kind: "audio",
    mimetypes: [
      "audio/aac",
      "audio/amr",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg"
    ],
    limit: 16 * MEGABYTE
  },
  {
    kind: "video",
    mimetypes: ["video/mp4", "video/3gp", "video/3gpp"],
    limit: 16 * MEGABYTE
  }
];

const DOCUMENT_LIMIT = 100 * MEGABYTE;

// Apelidos que chegam do navegador e a Meta nao reconhece - o gravador de
// audio do painel manda audio/mp3, que viraria documento sem isso.
const ALIASES: Record<string, string> = {
  "audio/mp3": "audio/mpeg",
  "image/jpg": "image/jpeg"
};

export const resolveMetaMediaKind = (
  mimetype: string
): { kind: MetaMediaKind; mimetype: string; limit: number } => {
  const raw = mimetype.split(";")[0].trim().toLowerCase();
  const base = ALIASES[raw] || raw;
  const match = KINDS.find(entry => entry.mimetypes.includes(base));

  return match
    ? { kind: match.kind, mimetype: base, limit: match.limit }
    : { kind: "document", mimetype: base, limit: DOCUMENT_LIMIT };
};

// O multipart entrega o nome do arquivo em latin1; sem isso acento virá
// quebrado no nome que o destinatario recebe.
const decodeFilename = (media: Express.Multer.File): string => {
  try {
    return iconv.decode(Buffer.from(media.originalname, "binary"), "utf8");
  } catch (error) {
    return media.originalname;
  }
};

export const uploadMetaMedia = async (
  connection: Whatsapp,
  content: Buffer,
  mimetype: string,
  filename: string
): Promise<string> => {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimetype);
  form.append(
    "file",
    new Blob([new Uint8Array(content)], { type: mimetype }),
    filename
  );

  const { data } = await getMetaGraphApiClient().post(
    `/${connection.metaPhoneNumberId}/media`,
    form,
    {
      ...withAuth(connection.metaAccessToken),
      // O client compartilhado usa 20s, curto demais pra upload de arquivo.
      timeout: 120000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  );

  if (!data?.id) {
    throw new AppError("ERR_META_MEDIA_UPLOAD", 502);
  }

  return data.id as string;
};

// Equivalente ao SendWhatsAppMedia.ts, mas via Cloud API oficial: sobe o
// arquivo pra Meta (/media), manda a mensagem referenciando o id retornado e
// persiste igual ao fluxo Baileys. Vale so dentro da janela de 24h; envio
// iniciado pela empresa precisa de template.
const SendMetaMediaMessageService = async ({
  media,
  ticket,
  connection,
  caption
}: Request): Promise<MetaSentMessage> => {
  if (!connection.metaPhoneNumberId || !connection.metaAccessToken) {
    throw new AppError("ERR_META_CONNECTION_NOT_CONFIGURED");
  }

  const filename = decodeFilename(media);
  const { kind, mimetype, limit } = resolveMetaMediaKind(
    media.mimetype || (mime.lookup(filename) as string) || "application/octet-stream"
  );

  if (media.size > limit) {
    throw new AppError("ERR_META_MEDIA_TOO_LARGE", 400);
  }

  const content = await fs.promises.readFile(media.path);

  // Guarda local antes de enviar: e daqui que o painel do atendente renderiza
  // a midia depois, porque a URL da Meta expira.
  const mediaUrl = await saveMediaToFile(
    { data: content, mimetype, filename },
    { destination: ticket }
  );

  const to = ticket.contact.number.replace(/\D/g, "");

  try {
    const mediaId = await uploadMetaMedia(
      connection,
      content,
      mimetype,
      filename
    );

    const { data } = await getMetaGraphApiClient().post(
      `/${connection.metaPhoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: kind,
        [kind]: {
          id: mediaId,
          ...(kind === "document" ? { filename } : {}),
          // Audio na Cloud API nao aceita legenda.
          ...(caption && kind !== "audio" ? { caption } : {})
        }
      },
      withAuth(connection.metaAccessToken)
    );

    const wamid: string = data.messages[0].id;

    await PersistMetaOutboundMessageService({
      wamid,
      body: caption || filename,
      ticket,
      media: { mediaUrl, mimetype, filename, kind }
    });

    return {
      key: { id: wamid, fromMe: true, remoteJid: to },
      message: { conversation: caption || filename }
    };
  } catch (err) {
    logger.error(
      { err, ticketId: ticket.id, kind },
      "Failed to send Meta media message"
    );
    throw err instanceof AppError ? err : new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendMetaMediaMessageService;
