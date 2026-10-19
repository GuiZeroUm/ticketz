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

describe("EmailThreadView headers and notices", () => {
  beforeAll(() => i18n.changeLanguage("pt"));

  const inbound = extra => ({
    messageId: `in-${Math.random()}`,
    direction: "in",
    from: { address: "carla@cliente.com", name: "Carla" },
    to: [{ address: "contato@empresa.com" }],
    cc: [],
    date: "2026-10-19T10:00:00.000Z",
    text: "",
    attachments: [],
    ...extra
  });

  const renderThread = messages =>
    render(
      <EmailThreadView
        ticket={{ id: 1, contact: { name: "Carla" } }}
        thread={{
          subject: "Proposta",
          account: { status: "active" },
          messages
        }}
      />
    );

  it("shows Reply-To next to To when it differs from From", () => {
    renderThread([
      inbound({ replyTo: [{ address: "vendas@cliente.com", name: "Vendas" }] })
    ]);
    expect(
      screen.getByText(content =>
        content.includes(
          i18n.t("emailChannel.inbox.thread.replyTo", {
            list: "vendas@cliente.com"
          })
        )
      )
    ).toBeTruthy();
  });

  it("hides an empty, missing or redundant Reply-To", () => {
    renderThread([
      inbound({ replyTo: [] }),
      inbound({}),
      inbound({ replyTo: [{ address: "CARLA@cliente.com" }] })
    ]);
    const label = i18n
      .t("emailChannel.inbox.thread.replyTo", { list: "" })
      .trim();
    expect(screen.queryByText(content => content.includes(label))).toBeNull();
  });

  it("shows the oversize notice only for headers-only messages", () => {
    renderThread([inbound({ oversize: true }), inbound({ oversize: false })]);
    expect(
      screen.getAllByText(i18n.t("emailChannel.inbox.thread.oversize"))
    ).toHaveLength(1);
  });
});
