import { normalizeVoicePeer } from "../VoiceContactService";

describe("normalizeVoicePeer", () => {
  it("removes the device suffix without appending it to the contact number", () => {
    expect(normalizeVoicePeer("7013815844992:2@lid")).toEqual({
      peer: "7013815844992:2@lid",
      number: "7013815844992@lid",
      lid: "7013815844992@lid"
    });
  });

  it("keeps a WhatsApp phone JID as a normalized phone number", () => {
    expect(normalizeVoicePeer("5511999999999:4@s.whatsapp.net")).toEqual({
      peer: "5511999999999:4@s.whatsapp.net",
      number: "5511999999999",
      lid: null
    });
  });
});
