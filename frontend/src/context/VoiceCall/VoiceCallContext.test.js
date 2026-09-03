import { validVoiceCallId } from "../../helpers/voiceCallId";

describe("validVoiceCallId", () => {
  test.each([1, "2", Number.MAX_SAFE_INTEGER])(
    "accepts a positive safe integer: %p",
    value => {
      expect(validVoiceCallId(value)).toBe(Number(value));
    }
  );

  test.each([undefined, null, "NaN", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid call identifier: %p",
    value => {
      expect(validVoiceCallId(value)).toBeNull();
    }
  );
});
