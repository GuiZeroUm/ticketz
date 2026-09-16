import Whatsapp from "../../../models/Whatsapp";
import Ticket from "../../../models/Ticket";
import { SendWhatsAppMedia } from "../SendWhatsAppMedia";

jest.mock("../../../models/Whatsapp");
// Guards against the pre-fix code path actually reaching real filesystem/
// storage I/O with a bogus path, which hangs instead of failing fast.
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  createReadStream: jest.fn(() => ({
    destroy: jest.fn(),
    pipe: jest.fn(),
    on: jest.fn()
  }))
}));
jest.mock("../../../helpers/saveMediaFile", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue("media/1/fake.png")
}));
// CheckSettings hits the real DB (Setting.findOne) - unreachable here, and
// hangs instead of failing fast.
jest.mock("../../../helpers/CheckSettings", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue("15")
}));
// wbotMessageListener and GetTicketWbot transitively import libs/wbot ->
// libs/socket, which opens a real ioredis connection at module load time -
// unreachable here, and it retries for a long time before giving up.
jest.mock("../wbotMessageListener", () => ({
  verifyMediaMessage: jest.fn(),
  verifyMessage: jest.fn()
}));
jest.mock("../../../helpers/GetTicketWbot", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.setTimeout(8000);

describe("SendWhatsAppMedia official mode guard", () => {
  it("rejects media on an official-mode connection instead of touching a Baileys session", async () => {
    (Whatsapp.findByPk as jest.Mock).mockResolvedValue({
      apiMode: "official"
    });
    const ticket = { whatsappId: 5 } as Ticket;
    const media = {
      path: "/tmp/does-not-exist.png",
      originalname: "photo.png",
      mimetype: "image/png",
      size: 10
    } as Express.Multer.File;

    await expect(SendWhatsAppMedia({ media, ticket })).rejects.toMatchObject({
      message: "ERR_WAPP_OFFICIAL_MODE_NOT_SUPPORTED"
    });
  });
});
