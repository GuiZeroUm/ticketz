import { clearTicketTemplatesCache } from "../ListTicketTemplatesService";
import Whatsapp from "../../../models/Whatsapp";
import ConnectMetaWhatsAppService from "../ConnectMetaWhatsAppService";
import ExchangeEmbeddedSignupCodeService from "../ExchangeEmbeddedSignupCodeService";
import RegisterPhoneNumberService from "../RegisterPhoneNumberService";
import AssertMetaWabaRuntimeService from "../AssertMetaWabaRuntimeService";
import { SubscribeWabaWebhookService } from "../SubscribeWabaWebhookService";
import ShowWhatsAppService from "../../WhatsappService/ShowWhatsAppService";

jest.mock("../../../models/Whatsapp");
jest.mock("../ListTicketTemplatesService", () => ({
  clearTicketTemplatesCache: jest.fn()
}));
jest.mock("../ExchangeEmbeddedSignupCodeService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../RegisterPhoneNumberService", () => ({
  ...jest.requireActual("../RegisterPhoneNumberService"),
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../AssertMetaWabaRuntimeService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../SubscribeWabaWebhookService", () => ({
  SubscribeWabaWebhookService: jest.fn()
}));
jest.mock("../../WhatsappService/ShowWhatsAppService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../../libs/socket", () => ({
  getIO: () => ({ to: () => ({ emit: jest.fn() }) })
}));

const request = {
  whatsappId: 9,
  companyId: 2,
  code: "code",
  wabaId: "waba",
  phoneNumberId: "phone",
  pin: "012345"
};
const update = jest.fn();
const originalEncryptionKey = process.env.ENCRYPTION_KEY;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.ENCRYPTION_KEY = "a".repeat(64);
  (Whatsapp.findOne as jest.Mock).mockResolvedValue({
    id: 9,
    apiMode: "official",
    update
  });
  (Whatsapp.count as jest.Mock).mockResolvedValue(0);
  (ExchangeEmbeddedSignupCodeService as jest.Mock).mockResolvedValue({
    accessToken: "private-token",
    expiresInSeconds: null
  });
  (ShowWhatsAppService as jest.Mock).mockResolvedValue({
    id: 9,
    status: "CONNECTED"
  });
});
afterAll(() => {
  if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalEncryptionKey;
});

it("passes the admin's PIN to Meta without persisting it", async () => {
  await ConnectMetaWhatsAppService(request);
  expect(AssertMetaWabaRuntimeService).toHaveBeenCalledWith("waba", 9);
  expect(clearTicketTemplatesCache).toHaveBeenCalledWith(9);
  expect(RegisterPhoneNumberService).toHaveBeenCalledWith(
    "phone",
    "private-token",
    "012345"
  );
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "CONNECTED" })
  );
  expect(update.mock.calls[0][0]).not.toHaveProperty("pin");
});

it.each([undefined, "12345", "abcdef", 123456])(
  "rejects invalid PIN %s before exchanging the code",
  async pin => {
    await expect(
      ConnectMetaWhatsAppService({ ...request, pin } as never)
    ).rejects.toMatchObject({ message: "ERR_META_INVALID_REGISTRATION_PIN" });
    expect(ExchangeEmbeddedSignupCodeService).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  }
);

it("never marks the connection ready when registration fails", async () => {
  (RegisterPhoneNumberService as jest.Mock).mockRejectedValueOnce(
    new Error("register failed")
  );
  await expect(ConnectMetaWhatsAppService(request)).rejects.toThrow(
    "register failed"
  );
  expect(SubscribeWabaWebhookService).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
