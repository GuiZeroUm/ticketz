import Whatsapp from "../../../models/Whatsapp";
import Message from "../../../models/Message";
import ProcessMetaWebhookEventService from "../ProcessMetaWebhookEventService";

jest.mock("../../../models/Whatsapp");
jest.mock("../../../models/Message");
jest.mock("../HandleMetaInboundMessageService", () => jest.fn());

const buildStatusPayload = (status: string) => ({
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "111" },
            statuses: [{ id: "wamid.123", status }]
          }
        }
      ]
    }
  ]
});

describe("ProcessMetaWebhookEventService ack mapping", () => {
  beforeEach(() => {
    (Whatsapp.findOne as jest.Mock).mockResolvedValue({
      id: 1,
      metaPhoneNumberId: "111"
    });
  });

  it.each([
    ["sent", 2],
    ["delivered", 3],
    ["read", 4],
    ["failed", -1]
  ])(
    "maps Meta status %s to the same ack scale MessagesList renders (%i)",
    async (status, expectedAck) => {
      await ProcessMetaWebhookEventService(buildStatusPayload(status));

      expect(Message.update).toHaveBeenCalledWith(
        { ack: expectedAck },
        { where: { id: "wamid.123" } }
      );
    }
  );
});
