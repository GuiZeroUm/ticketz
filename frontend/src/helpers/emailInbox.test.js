import { i18n } from "../translate/i18n";
import {
  defaultRecipients,
  replySubject,
  translateEmailSendError
} from "./emailInbox";

const thread = {
  account: { address: "comercial@empresa.com" },
  subject: "Proposta",
  messages: [
    {
      direction: "in",
      from: { address: "carla@cliente.com", name: "Carla" },
      to: [
        { address: "comercial@empresa.com" },
        { address: "joao@cliente.com" }
      ],
      cc: [{ address: "CARLA@cliente.com" }, { address: "ana@cliente.com" }]
    },
    {
      direction: "out",
      from: { address: "comercial@empresa.com" },
      to: [{ address: "carla@cliente.com" }]
    }
  ]
};

describe("emailInbox helpers", () => {
  beforeAll(() => i18n.changeLanguage("pt"));

  it("prefixes the subject once per mode", () => {
    expect(replySubject("Proposta", "reply")).toBe("Re: Proposta");
    expect(replySubject("RE: Proposta", "replyAll")).toBe("RE: Proposta");
    expect(replySubject("Proposta", "forward")).toBe("Enc: Proposta");
    expect(replySubject("Fwd: Proposta", "forward")).toBe("Fwd: Proposta");
  });

  it("follows the backend recipient defaults", () => {
    expect(defaultRecipients(thread, "reply")).toEqual({
      to: "carla@cliente.com",
      cc: ""
    });
    expect(defaultRecipients(thread, "replyAll")).toEqual({
      to: "carla@cliente.com",
      cc: "joao@cliente.com, ana@cliente.com"
    });
    expect(defaultRecipients(thread, "forward")).toEqual({ to: "", cc: "" });
  });

  it("prefers Reply-To over From", () => {
    const withReplyTo = {
      ...thread,
      messages: [
        { ...thread.messages[0], replyTo: [{ address: "vendas@cliente.com" }] }
      ]
    };
    expect(defaultRecipients(withReplyTo, "reply").to).toBe(
      "vendas@cliente.com"
    );
  });

  it("translates send error codes, including server status codes", () => {
    expect(translateEmailSendError("ERR_EMAIL_BOUNCED")).toBe(
      i18n.t("backendErrors.ERR_EMAIL_BOUNCED")
    );
    expect(translateEmailSendError("ERR_EMAIL_REJECTED_550")).toContain("550");
    expect(translateEmailSendError("ERR_GMAIL_SEND_403")).toContain("403");
    expect(translateEmailSendError("ERR_EMAIL_WHATEVER")).not.toMatch(/ERR_/);
    expect(translateEmailSendError("ERR_EMAIL_AUTH_FAILED")).toBe(
      i18n.t("backendErrors.ERR_EMAIL_AUTH_FAILED")
    );
    expect(translateEmailSendError("ERR_EMAIL_REJECTED_EENVELOPE")).not.toMatch(
      /ERR_/
    );
  });
});
