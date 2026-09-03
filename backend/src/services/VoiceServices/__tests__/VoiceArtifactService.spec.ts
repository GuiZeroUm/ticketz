import { GetCompanySetting } from "../../../helpers/CheckSettings";
import { assertVoiceTranscriptionConfigured } from "../VoiceArtifactService";

jest.mock("../../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn()
}));
jest.mock("../../../models/VoiceCall");
jest.mock("../../../models/Contact");
jest.mock("../../../models/User");
jest.mock("../../MessageServices/CreateMessageService");
jest.mock("../VoiceHistoryService", () => ({
  durationLabel: jest.fn(),
  voiceMessageId: jest.fn()
}));
jest.mock("../WaCallsClient", () => ({ waCallsClient: {} }));

const getCompanySetting = GetCompanySetting as jest.MockedFunction<
  typeof GetCompanySetting
>;

describe("Groq voice transcription credentials", () => {
  beforeEach(() => {
    process.env.VOICE_TRANSCRIPTION_PROVIDER = "groq";
    delete process.env.GROQ_API_KEY;
    getCompanySetting.mockImplementation(async (_companyId, key) =>
      key === "openAiKey" ? "openai-key-must-not-be-reused" : ""
    );
  });

  afterEach(() => {
    delete process.env.VOICE_TRANSCRIPTION_PROVIDER;
    delete process.env.GROQ_API_KEY;
  });

  it("requires GROQ_API_KEY instead of reusing a tenant OpenAI key", async () => {
    await expect(assertVoiceTranscriptionConfigured(1)).rejects.toThrow(
      "ERR_VOICE_TRANSCRIPTION_NOT_CONFIGURED"
    );
    expect(getCompanySetting).not.toHaveBeenCalledWith(1, "openAiKey", "");
  });

  it("accepts the Groq key from the process environment", async () => {
    process.env.GROQ_API_KEY = "groq-test-key";
    await expect(
      assertVoiceTranscriptionConfigured(1)
    ).resolves.toBeUndefined();
  });
});
