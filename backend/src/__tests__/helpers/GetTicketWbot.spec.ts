/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock("../../libs/wbot", () => ({ getWbot: jest.fn() }));
jest.mock("../../helpers/GetDefaultWhatsApp", () => ({
  __esModule: true,
  default: jest.fn()
}));

import { getWbot } from "../../libs/wbot";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import GetTicketWbot from "../../helpers/GetTicketWbot";

describe("GetTicketWbot", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses an email ticket before touching its connection", async () => {
    const ticket: any = {
      id: 1,
      companyId: 7,
      channel: "email",
      whatsappId: null,
      $set: jest.fn()
    };

    await expect(GetTicketWbot(ticket)).rejects.toMatchObject({
      message: "ERR_INVALID_CHANNEL",
      statusCode: 400
    });
    expect(ticket.$set).not.toHaveBeenCalled();
    expect(GetDefaultWhatsApp).not.toHaveBeenCalled();
    expect(getWbot).not.toHaveBeenCalled();
  });

  it("keeps assigning the default connection to WhatsApp tickets without one", async () => {
    const ticket: any = {
      id: 2,
      companyId: 7,
      channel: "whatsapp",
      whatsappId: null,
      $set: jest.fn(async () => {
        ticket.whatsappId = 9;
      })
    };
    (GetDefaultWhatsApp as jest.Mock).mockResolvedValue({ id: 9 });
    (getWbot as jest.Mock).mockReturnValue("session-9");

    await expect(GetTicketWbot(ticket)).resolves.toBe("session-9");
    expect(ticket.$set).toHaveBeenCalledWith("whatsapp", { id: 9 });
    expect(getWbot).toHaveBeenCalledWith(9);
  });
});
