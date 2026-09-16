import Whatsapp from "../../../models/Whatsapp";
import RegisterPhoneNumberService from "../RegisterPhoneNumberService";
import { SubscribeWabaWebhookService } from "../SubscribeWabaWebhookService";
import { getIO } from "../../../libs/socket";
import ConnectMetaWhatsAppManualService from "../ConnectMetaWhatsAppManualService";

jest.mock("../../../models/Whatsapp");
jest.mock("../RegisterPhoneNumberService");
jest.mock("../SubscribeWabaWebhookService");
jest.mock("../../../libs/socket");

const registerPhoneNumber = RegisterPhoneNumberService as jest.MockedFunction<
  typeof RegisterPhoneNumberService
>;
const subscribeWabaWebhook = SubscribeWabaWebhookService as jest.MockedFunction<
  typeof SubscribeWabaWebhookService
>;

describe("ConnectMetaWhatsAppManualService", () => {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));

  beforeEach(() => {
    jest.clearAllMocks();
    (getIO as jest.Mock).mockReturnValue({ to });
  });

  it("rejects when the connection does not belong to the company", async () => {
    (Whatsapp.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      ConnectMetaWhatsAppManualService({
        whatsappId: 9,
        companyId: 1,
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        accessToken: "token-1"
      })
    ).rejects.toMatchObject({ message: "ERR_NO_WAPP_FOUND" });
  });

  it("rejects a connection that was never switched to official mode", async () => {
    (Whatsapp.findOne as jest.Mock).mockResolvedValue({
      apiMode: "baileys",
      update: jest.fn()
    });

    await expect(
      ConnectMetaWhatsAppManualService({
        whatsappId: 9,
        companyId: 1,
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        accessToken: "token-1"
      })
    ).rejects.toMatchObject({ message: "ERR_WAPP_NOT_OFFICIAL_MODE" });

    expect(registerPhoneNumber).not.toHaveBeenCalled();
  });

  it("registers the phone number, subscribes the webhook and stores the credentials as-is", async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    (Whatsapp.findOne as jest.Mock).mockResolvedValue({
      id: 9,
      companyId: 1,
      apiMode: "official",
      update
    });

    await ConnectMetaWhatsAppManualService({
      whatsappId: 9,
      companyId: 1,
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      accessToken: "token-1",
      businessId: "biz-1"
    });

    expect(registerPhoneNumber).toHaveBeenCalledWith(
      "phone-1",
      "token-1",
      undefined
    );
    expect(subscribeWabaWebhook).toHaveBeenCalledWith("waba-1", "token-1");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        metaWabaId: "waba-1",
        metaPhoneNumberId: "phone-1",
        metaBusinessId: "biz-1",
        metaAccessToken: "token-1",
        metaTokenExpiresAt: null,
        status: "CONNECTED"
      })
    );
    expect(to).toHaveBeenCalledWith("company-1-admin");
    expect(emit).toHaveBeenCalledWith(
      "company-1-whatsappSession",
      expect.objectContaining({ action: "update" })
    );
  });
});
