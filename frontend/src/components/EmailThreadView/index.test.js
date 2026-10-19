import React from "react";
import { render, screen } from "@testing-library/react";
import EmailThreadView from ".";
import { i18n } from "../../translate/i18n";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

const out = (sendStatus, code) => ({
  messageId: `${sendStatus}-${code}`,
  direction: "out",
  from: { address: "contato@empresa.com", name: "Contato" },
  to: [{ address: "carla@cliente.com" }],
  cc: [],
  date: "2026-10-19T10:00:00.000Z",
  text: "Olá",
  sendStatus,
  sendError: code ? { code } : null,
  attachments: []
});

describe("EmailThreadView send status", () => {
  beforeAll(() => i18n.changeLanguage("pt"));

  it("shows a partial rejection as sent with a warning and failures translated", () => {
    render(
      <EmailThreadView
        ticket={{ id: 1, contact: { name: "Carla" } }}
        thread={{
          subject: "Proposta",
          account: { status: "active" },
          messages: [
            out("sent", "ERR_EMAIL_PARTIAL_REJECTION"),
            out("failed", "ERR_EMAIL_REJECTED"),
            out("failed", "ERR_EMAIL_SOMETHING_NEW")
          ]
        }}
      />
    );
    expect(
      screen.getByText(i18n.t("emailChannel.inbox.status.partial"))
    ).toBeTruthy();
    expect(
      screen.getByText(
        i18n.t("emailChannel.inbox.status.failedWithReason", {
          reason: i18n.t("backendErrors.ERR_EMAIL_REJECTED")
        })
      )
    ).toBeTruthy();
    expect(screen.queryByText(/ERR_/)).toBeNull();
  });
});
