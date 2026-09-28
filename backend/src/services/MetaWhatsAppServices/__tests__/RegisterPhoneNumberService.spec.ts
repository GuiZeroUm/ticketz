import RegisterPhoneNumberService from "../RegisterPhoneNumberService";
import { getMetaGraphApiClient } from "../MetaGraphApiClient";

jest.mock("../MetaGraphApiClient", () => ({
  getMetaGraphApiClient: jest.fn(),
  withAuth: jest.fn(() => ({ headers: { Authorization: "redacted" } }))
}));
jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn() }
}));

const post = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (getMetaGraphApiClient as jest.Mock).mockReturnValue({ post });
});

it("registers successfully only when Graph accepts registration", async () => {
  post.mockResolvedValue({ data: { success: true } });
  await expect(
    RegisterPhoneNumberService("phone", "token", "123456")
  ).resolves.toBeUndefined();
  expect(post).toHaveBeenCalledWith(
    "/phone/register",
    { messaging_product: "whatsapp", pin: "123456" },
    expect.any(Object)
  );
});

it.each([133010, 133000, 190])(
  "rejects registration error %i instead of connecting",
  async graphCode => {
    post.mockRejectedValue({ graphCode });
    await expect(
      RegisterPhoneNumberService("phone", "token")
    ).rejects.toMatchObject({ message: "ERR_META_PHONE_REGISTER_FAILED" });
  }
);
