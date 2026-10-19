import {
  ALL_CONNECTIONS,
  connectionOptions,
  connectionParams,
  ticketMatchesChannel,
  ticketMatchesConnection
} from "./inboxConnections";
import { i18n } from "../translate/i18n";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

jest.mock("../errors/toastError", () => jest.fn());

const whatsApps = [
  { id: 1, name: "Suporte", channel: "whatsapp", apiMode: "baileys" },
  { id: 2, name: "Vendas", channel: "whatsapp", apiMode: "official" },
  { id: 3, name: "Antiga" },
  { id: 4, name: "Página", channel: "facebook" }
];

const emailAccounts = [
  { id: 7, name: "Comercial", provider: "gmail_api", preset: "gmail" },
  { id: 8, name: "", address: "contato@empresa.com", preset: "custom" }
];

describe("inbox connection filter", () => {
  beforeAll(() => i18n.changeLanguage("pt"));

  it("lists WhatsApp connections and email accounts as Provider · Name", () => {
    const options = connectionOptions({ whatsApps, emailAccounts });
    expect(options.map(option => option.value)).toEqual([
      ALL_CONNECTIONS,
      "whatsapp:1",
      "whatsapp:2",
      "whatsapp:3",
      "email:7",
      "email:8"
    ]);
    expect(options[0].label).toBe(
      i18n.t("emailChannel.inbox.filters.allConnections")
    );
    expect(options[1].label).toBe("WhatsApp · Suporte");
    expect(options[2].label).toBe("WhatsApp API · Vendas");
    expect(options[4].label).toBe("Gmail · Comercial");
    expect(options[5].label).toBe(
      `${i18n.t(
        "emailChannel.connections.providers.custom"
      )} · contato@empresa.com`
    );
  });

  it("limits the options to the channel picked in the chips", () => {
    const values = channel =>
      connectionOptions({ whatsApps, emailAccounts, channel }).map(
        option => option.value
      );
    expect(values("whatsapp")).toEqual([
      ALL_CONNECTIONS,
      "whatsapp:1",
      "whatsapp:2",
      "whatsapp:3"
    ]);
    expect(values("email")).toEqual([ALL_CONNECTIONS, "email:7", "email:8"]);
    expect(
      connectionOptions({ whatsApps, emailAccounts: [], channel: "email" })
    ).toHaveLength(1);
  });

  it("turns a value into the GET /tickets params", () => {
    expect(connectionParams("whatsapp:2")).toEqual({ whatsappId: 2 });
    expect(connectionParams("email:7")).toEqual({ emailAccountId: 7 });
    expect(connectionParams(ALL_CONNECTIONS)).toEqual({});
    expect(connectionParams("email:abc")).toEqual({});
    expect(connectionParams(undefined)).toEqual({});
  });

  it("filters socket tickets the same way", () => {
    const email = { channel: "email", emailAccountId: 7, whatsappId: null };
    const whatsapp = { channel: "whatsapp", whatsappId: 2 };
    const legacy = { channel: null, whatsappId: 1 };
    expect(ticketMatchesConnection(email, { emailAccountId: 7 })).toBe(true);
    expect(ticketMatchesConnection(email, { emailAccountId: 8 })).toBe(false);
    expect(ticketMatchesConnection(whatsapp, { whatsappId: 2 })).toBe(true);
    expect(ticketMatchesConnection(email, { whatsappId: 2 })).toBe(false);
    expect(ticketMatchesConnection(email, {})).toBe(true);

    expect(ticketMatchesChannel(email, undefined)).toBe(true);
    expect(ticketMatchesChannel(email, "email")).toBe(true);
    expect(ticketMatchesChannel(email, "whatsapp")).toBe(false);
    expect(ticketMatchesChannel(whatsapp, "whatsapp")).toBe(true);
    expect(ticketMatchesChannel(legacy, "whatsapp")).toBe(true);
    // the WhatsApp chip is "everything but email"
    expect(ticketMatchesChannel({ channel: "voice" }, "whatsapp")).toBe(true);
    expect(ticketMatchesChannel(legacy, "email")).toBe(false);
  });
});
