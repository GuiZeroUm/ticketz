import { promises as fs } from "fs";
import { Op } from "sequelize";
import { jidNormalizedUser } from "libzapitu-rf";
import { getWbot } from "../../../libs/wbot";
import BaileysContact from "../../../models/BaileysContact";
import Contact from "../../../models/Contact";
import Whatsapp from "../../../models/Whatsapp";
import WhatsappLidMap from "../../../models/WhatsappLidMap";
import WhatsappStatusPost, {
  StatusKind
} from "../../../models/WhatsappStatusPost";
import { resolveStatusMediaPath } from "../StatusMediaService";
import { logger } from "../../../utils/logger";
import OfficialStatusProvider from "./OfficialStatusProvider";
import {
  StatusCapabilities,
  StatusProvider,
  StatusPublishError
} from "./types";

// Only versions proven to appear on a recipient's phone belong here.
// 1.0.0-alpha.16: a text story sent with LID-addressed recipients was
// accepted by the server and seen on the owner's phone on 2026-11-07.
// Dev can opt in other versions with WHATSAPP_STATUS_VERIFIED_LIBS.
export const VERIFIED_LIBZAPITU_VERSIONS: string[] = ["1.0.0-alpha.16"];

// Kinds that did not show up on the phone in the experiment.
export const UNVERIFIED_KINDS: StatusKind[] = [];

const ALL_KINDS: StatusKind[] = ["text", "image", "video"];
const STATUS_ACK_EVENT = "CB:ack,class:message";
const STATUS_ACK_TIMEOUT_MS = 15000;

// Read once: the installed fork only changes with a new deployment.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const INSTALLED_VERSION: string = require("libzapitu-rf/package.json").version;

const verifiedVersions = (): string[] => [
  ...VERIFIED_LIBZAPITU_VERSIONS,
  ...(process.env.WHATSAPP_STATUS_VERIFIED_LIBS || "")
    .split(",")
    .map(version => version.trim())
    .filter(Boolean)
];

const capabilities = (connection: Whatsapp): StatusCapabilities => {
  if (connection.apiMode === "official") {
    return OfficialStatusProvider.capabilities(connection);
  }
  if (!verifiedVersions().includes(INSTALLED_VERSION)) {
    return {
      publishStatus: false,
      kinds: [],
      reason: "LIB_NOT_VERIFIED",
      manualExport: true,
      ownPostsSync: false
    };
  }
  const kinds = ALL_KINDS.filter(kind => !UNVERIFIED_KINDS.includes(kind));
  if (connection.status !== "CONNECTED") {
    return {
      publishStatus: false,
      kinds,
      reason: "DISCONNECTED",
      manualExport: false,
      ownPostsSync: false
    };
  }
  return {
    publishStatus: true,
    kinds,
    reason: null,
    manualExport: false,
    ownPostsSync: false
  };
};

// Everything that can fail without sending is checked before sendMessage, so
// a transient error here always means nothing reached the session.
const buildContent = async (
  post: WhatsappStatusPost
): Promise<Record<string, unknown>> => {
  if (post.kind === "text") return { text: post.body };

  let absPath: string;
  try {
    if (!post.mediaPath) throw new Error("missing media");
    absPath = resolveStatusMediaPath(post.companyId, post.mediaPath);
    await fs.access(absPath);
  } catch {
    throw new StatusPublishError("ERR_STATUS_MEDIA_INVALID", true);
  }
  const media =
    post.kind === "image"
      ? { image: { url: absPath } }
      : { video: { url: absPath } };
  return post.body ? { ...media, caption: post.body } : media;
};

type StatusSocket = ReturnType<typeof getWbot>;

const USER_JID_SUFFIX = "@s.whatsapp.net";
const LID_SUFFIX = "@lid";

// Phones without a known LID are asked to WhatsApp in small batches, with a
// short pause between them, instead of one query with the whole audience.
export const LID_LOOKUP_BATCH_SIZE = 50;
const DEFAULT_LID_LOOKUP_PAUSE_MS = 300;
const DEFAULT_MAX_LID_LOOKUP = 1000;

const positiveEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
};

const lookupPauseMs = (): number =>
  positiveEnv(
    "WHATSAPP_STATUS_LID_LOOKUP_PAUSE_MS",
    DEFAULT_LID_LOOKUP_PAUSE_MS
  );

// Upper bound of phones asked to WhatsApp per story. Contacts above it that
// have no known LID are left out of that story (counted in the log).
const maxLidLookup = (): number =>
  positiveEnv("WHATSAPP_STATUS_MAX_LID_LOOKUP", DEFAULT_MAX_LID_LOOKUP);

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();

const asLid = (value: unknown): string | null =>
  typeof value === "string" && value.endsWith(LID_SUFFIX)
    ? jidNormalizedUser(value)
    : null;

const phoneOf = (jid: string): string => jid.split("@")[0].split(":")[0];

// LIDs already stored for these phones: the connection's synced address book
// first, then the company's LID map. Nothing here talks to WhatsApp.
const knownLids = async (
  companyId: number,
  whatsappId: number,
  phones: string[]
): Promise<Map<string, string>> => {
  const known = new Map<string, string>();
  if (!phones.length) return known;

  const book = await BaileysContact.findAll({
    attributes: ["contactId", "payload"],
    where: { whatsappId, contactId: { [Op.in]: phones } },
    include: [
      {
        model: Whatsapp,
        attributes: [],
        required: true,
        where: { id: whatsappId, companyId }
      }
    ]
  });
  book.forEach(row => {
    const lid = asLid(row.payload?.lid);
    if (lid) known.set(row.contactId, lid);
  });

  const missing = phones.filter(phone => !known.has(phone));
  if (!missing.length) return known;

  const mapped = await WhatsappLidMap.findAll({
    attributes: ["lid"],
    where: { companyId },
    include: [
      {
        model: Contact,
        attributes: ["number"],
        required: true,
        where: { companyId, number: { [Op.in]: missing.map(phoneOf) } }
      }
    ]
  });
  mapped.forEach(row => {
    const lid = asLid(row.lid);
    const number = row.contact?.number;
    if (!lid || !number) return;
    const phone = `${number}${USER_JID_SUFFIX}`;
    if (!known.has(phone)) known.set(phone, lid);
  });
  return known;
};

// Asks WhatsApp for the LIDs of the remaining phones, batch by batch. A failed
// batch is skipped and counted; numbers without WhatsApp are left out.
const lookupLids = async (
  wbot: StatusSocket,
  phones: string[]
): Promise<{ lids: string[]; failedBatches: number }> => {
  const lids: string[] = [];
  let failedBatches = 0;
  for (let start = 0; start < phones.length; start += LID_LOOKUP_BATCH_SIZE) {
    if (start > 0) {
      await sleep(lookupPauseMs());
    }
    const batch = phones.slice(start, start + LID_LOOKUP_BATCH_SIZE);
    try {
      const found = (await wbot.onWhatsApp(...batch)) || [];
      found.forEach(entry => {
        const lid = asLid(entry?.lid);
        if (lid) lids.push(lid);
      });
    } catch {
      failedBatches += 1;
    }
  }
  return { lids, failedBatches };
};

// WhatsApp answers 400 to a status whose recipients mix phone JIDs with LIDs
// (the fork always adds the sender's own LID device). So everyone, the owner
// first, is addressed by LID; numbers without WhatsApp are left out.
const lidStatusJidList = async (
  wbot: StatusSocket,
  post: WhatsappStatusPost,
  audience: string[]
): Promise<string[]> => {
  const ownLid = asLid(wbot.user?.lid);
  if (!ownLid) {
    throw new StatusPublishError("ERR_STATUS_OWN_LID_UNAVAILABLE", true);
  }

  const phones = Array.from(new Set(audience));
  const known = await knownLids(post.companyId, post.whatsappId, phones);
  const unknown = phones.filter(phone => !known.has(phone));
  const toLookup = unknown.slice(0, maxLidLookup());
  const { lids: lookedUp, failedBatches } = await lookupLids(wbot, toLookup);

  const recipients = Array.from(
    new Set([...known.values(), ...lookedUp])
  ).filter(lid => lid !== ownLid);

  // Counts only: never phone numbers or LIDs.
  logger.info(
    {
      postId: post.id,
      requested: phones.length,
      known: known.size,
      lookedUp: toLookup.length,
      skipped: unknown.length - toLookup.length,
      failedBatches,
      resolved: recipients.length
    },
    "Whatsapp status recipients resolved"
  );

  if (phones.length && !recipients.length) {
    throw new StatusPublishError("ERR_STATUS_AUDIENCE_EMPTY", true);
  }
  return [ownLid, ...recipients];
};

const publish = async (
  post: WhatsappStatusPost,
  connection: Whatsapp,
  audience: string[]
): Promise<{ remoteMessageId: string }> => {
  if (connection.apiMode === "official") {
    return OfficialStatusProvider.publish(post, connection, audience);
  }
  const content = await buildContent(post);

  let wbot: ReturnType<typeof getWbot>;
  try {
    wbot = getWbot(connection.id);
  } catch (error) {
    if (error?.message === "ERR_WAPP_NOT_INITIALIZED") {
      throw new StatusPublishError("ERR_STATUS_CONNECTION_UNAVAILABLE", false);
    }
    throw error;
  }
  if (!wbot?.user?.id) {
    throw new StatusPublishError("ERR_STATUS_CONNECTION_UNAVAILABLE", false);
  }

  const statusJidList = await lidStatusJidList(wbot, post, audience);
  const options: Record<string, unknown> = { broadcast: true, statusJidList };
  if (post.kind === "text") {
    if (post.backgroundColor) options.backgroundColor = post.backgroundColor;
    if (post.font !== null && post.font !== undefined) options.font = post.font;
  }

  // sendMessage resolves after writing the stanza, before the server ACK.
  // Register first because the ACK can arrive before sendMessage resolves.
  const observed = new Map<string, string | null>();
  let expectedId: string | null = null;
  let acceptAck: ((code: string | null) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAck = (node: {
    attrs?: { id?: string; from?: string; error?: string };
  }): void => {
    const attrs = node?.attrs;
    if (attrs?.from !== "status@broadcast" || !attrs.id) return;
    const code = attrs.error || null;
    observed.set(attrs.id, code);
    if (attrs.id === expectedId && acceptAck) acceptAck(code);
  };
  const socket = wbot.ws;
  socket.on(STATUS_ACK_EVENT, onAck);
  try {
    const sent = await wbot.sendMessage(
      "status@broadcast",
      content as never,
      options as never
    );
    const remoteMessageId = sent?.key?.id;
    if (!remoteMessageId) {
      throw new StatusPublishError("ERR_STATUS_NO_CONFIRMATION", true);
    }

    const ackCode = await new Promise<string | null | undefined>(resolve => {
      expectedId = remoteMessageId;
      acceptAck = resolve;
      if (observed.has(remoteMessageId)) {
        resolve(observed.get(remoteMessageId));
      } else {
        timer = setTimeout(() => resolve(undefined), STATUS_ACK_TIMEOUT_MS);
      }
    });
    if (ackCode === undefined) {
      throw new StatusPublishError("ERR_STATUS_NO_CONFIRMATION", true);
    }
    if (ackCode) {
      logger.warn(
        { postId: post.id, ackError: ackCode },
        "Whatsapp status rejected by server"
      );
      throw new StatusPublishError("ERR_STATUS_SERVER_REJECTED", true);
    }
    return { remoteMessageId };
  } finally {
    if (timer) clearTimeout(timer);
    socket.off(STATUS_ACK_EVENT, onAck);
  }
};

const BaileysStatusProvider: StatusProvider = { capabilities, publish };

export default BaileysStatusProvider;
