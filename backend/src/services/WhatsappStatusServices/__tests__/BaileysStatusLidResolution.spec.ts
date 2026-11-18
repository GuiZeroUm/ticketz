import { EventEmitter } from "events";
import { getWbot } from "../../../libs/wbot";
import BaileysContact from "../../../models/BaileysContact";
import WhatsappLidMap from "../../../models/WhatsappLidMap";
import { logger } from "../../../utils/logger";
import BaileysStatusProvider, {
  LID_LOOKUP_BATCH_SIZE
} from "../providers/BaileysStatusProvider";
import { StatusPublishError } from "../providers/types";

jest.mock("../../../libs/wbot", () => ({ getWbot: jest.fn() }));
jest.mock("libzapitu-rf", () => ({
  jidNormalizedUser: (jid: string) => jid.replace(/:\d+@/, "@")
}));
jest.mock("../../../models/BaileysContact", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));
jest.mock("../../../models/WhatsappLidMap", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));
jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: class MockContact {}
}));
jest.mock("../../../models/Whatsapp", () => ({
  __esModule: true,
  default: class MockWhatsapp {}
}));
jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock("../StatusMediaService", () => ({
  resolveStatusMediaPath: jest.fn()
}));

const bookFindAll = BaileysContact.findAll as unknown as jest.Mock;
const lidMapFindAll = WhatsappLidMap.findAll as unknown as jest.Mock;
const logInfo = logger.info as unknown as jest.Mock;

const OWN_LID = "900:3@lid";
const phone = (n: number) => `55689${String(n).padStart(8, "0")}`;
const jid = (n: number) => `${phone(n)}@s.whatsapp.net`;
const lidOf = (n: number) => `${7000 + n}@lid`;

const connection = { id: 11, companyId: 7, apiMode: "baileys" } as never;
const post = {
  id: 5,
  companyId: 7,
  whatsappId: 11,
  kind: "text",
  body: "Oi"
} as never;

let onWhatsApp: jest.Mock;
let sendMessage: jest.Mock;

const mockSocket = (
  user: Record<string, unknown> = { id: "1@s.whatsapp.net", lid: OWN_LID }
) => {
  const ws = new EventEmitter();
  sendMessage = jest.fn().mockImplementation(async () => {
    setImmediate(() =>
      ws.emit("CB:ack,class:message", {
        attrs: { id: "SENT1", from: "status@broadcast" }
      })
    );
    return { key: { id: "SENT1" } };
  });
  (getWbot as jest.Mock).mockReturnValue({ user, onWhatsApp, sendMessage, ws });
};

// WhatsApp knows every asked phone.
const answerAll = async (...jids: string[]) =>
  jids.map(item => {
    const n = Number(item.split("@")[0].slice(5));
    return { jid: item, exists: true, lid: lidOf(n) };
  });

const range = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => from + index);

const recipients = () => sendMessage.mock.calls[0][2].statusJidList as string[];

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WHATSAPP_STATUS_VERIFIED_LIBS = "1.0.0-alpha.16";
  process.env.WHATSAPP_STATUS_LID_LOOKUP_PAUSE_MS = "0";
  delete process.env.WHATSAPP_STATUS_MAX_LID_LOOKUP;
  bookFindAll.mockResolvedValue([]);
  lidMapFindAll.mockResolvedValue([]);
  onWhatsApp = jest.fn(answerAll);
  mockSocket();
});

afterAll(() => {
  delete process.env.WHATSAPP_STATUS_VERIFIED_LIBS;
  delete process.env.WHATSAPP_STATUS_LID_LOOKUP_PAUSE_MS;
});

describe("BaileysStatusProvider: recipient resolution", () => {
  it("uses LIDs already known from the address book and the LID map without asking WhatsApp", async () => {
    bookFindAll.mockResolvedValue([
      { contactId: jid(1), payload: { lid: lidOf(1) } },
      { contactId: jid(2), payload: { lid: lidOf(2) } }
    ]);
    lidMapFindAll.mockResolvedValue([
      { lid: lidOf(3), contact: { number: phone(3) } }
    ]);

    await BaileysStatusProvider.publish(post, connection, [
      jid(1),
      jid(2),
      jid(3)
    ]);

    expect(onWhatsApp).not.toHaveBeenCalled();
    expect(recipients()).toEqual(["900@lid", lidOf(1), lidOf(2), lidOf(3)]);
  });

  it("asks WhatsApp only for phones without a known LID", async () => {
    bookFindAll.mockResolvedValue([
      { contactId: jid(1), payload: { lid: lidOf(1) } }
    ]);

    await BaileysStatusProvider.publish(post, connection, [jid(1), jid(2)]);

    expect(onWhatsApp).toHaveBeenCalledTimes(1);
    expect(onWhatsApp).toHaveBeenCalledWith(jid(2));
    expect(recipients()).toEqual(["900@lid", lidOf(1), lidOf(2)]);
  });

  it("filters the stored LIDs by the company of the story", async () => {
    await BaileysStatusProvider.publish(post, connection, [jid(1)]);

    expect(bookFindAll.mock.calls[0][0].include).toEqual([
      expect.objectContaining({
        required: true,
        where: { id: 11, companyId: 7 }
      })
    ]);
    expect(lidMapFindAll.mock.calls[0][0].where).toEqual({ companyId: 7 });
    expect(lidMapFindAll.mock.calls[0][0].include[0].where).toEqual(
      expect.objectContaining({ companyId: 7 })
    );
  });

  it("asks WhatsApp in batches instead of one query with the whole audience", async () => {
    const audience = range(1, 120).map(jid);

    await BaileysStatusProvider.publish(post, connection, audience);

    expect(LID_LOOKUP_BATCH_SIZE).toBe(50);
    expect(onWhatsApp.mock.calls.map(call => call.length)).toEqual([
      50, 50, 20
    ]);
    expect(recipients()).toHaveLength(121);
  });

  it("keeps publishing when one batch fails and logs only counts", async () => {
    const audience = range(1, 120).map(jid);
    onWhatsApp = jest
      .fn(answerAll)
      .mockImplementationOnce(answerAll)
      .mockImplementationOnce(async () => {
        throw new Error("timed out");
      });
    mockSocket();

    await BaileysStatusProvider.publish(post, connection, audience);

    expect(onWhatsApp).toHaveBeenCalledTimes(3);
    expect(recipients()).toHaveLength(1 + 70);
    const [fields] = logInfo.mock.calls.find(
      call => call[1] === "Whatsapp status recipients resolved"
    );
    expect(fields).toEqual({
      postId: 5,
      requested: 120,
      known: 0,
      lookedUp: 120,
      skipped: 0,
      failedBatches: 1,
      resolved: 70
    });
    expect(JSON.stringify(logInfo.mock.calls)).not.toMatch(/55689|@lid/);
  });

  it("caps how many phones are asked to WhatsApp for one story", async () => {
    process.env.WHATSAPP_STATUS_MAX_LID_LOOKUP = "60";
    const audience = range(1, 100).map(jid);

    await BaileysStatusProvider.publish(post, connection, audience);

    expect(onWhatsApp.mock.calls.map(call => call.length)).toEqual([50, 10]);
    expect(recipients()).toHaveLength(61);
  });

  it("fails with ERR_STATUS_AUDIENCE_EMPTY and sends nothing when no recipient is resolved", async () => {
    onWhatsApp = jest.fn(async () => {
      throw new Error("timed out");
    });
    mockSocket();

    await expect(
      BaileysStatusProvider.publish(post, connection, [jid(1), jid(2)])
    ).rejects.toEqual(
      new StatusPublishError("ERR_STATUS_AUDIENCE_EMPTY", true)
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("fails with ERR_STATUS_AUDIENCE_EMPTY when no asked number is on WhatsApp", async () => {
    onWhatsApp = jest.fn(async () => []);
    mockSocket();

    await expect(
      BaileysStatusProvider.publish(post, connection, [jid(1)])
    ).rejects.toMatchObject({
      code: "ERR_STATUS_AUDIENCE_EMPTY",
      permanent: true
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("fails clearly when the connection has no LID of its own", async () => {
    mockSocket({ id: "1@s.whatsapp.net" });

    await expect(
      BaileysStatusProvider.publish(post, connection, [jid(1)])
    ).rejects.toEqual(
      new StatusPublishError("ERR_STATUS_OWN_LID_UNAVAILABLE", true)
    );
    expect(onWhatsApp).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
