import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import EmailAccountModal, { secureForPort } from ".";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
    post: jest.fn(() => Promise.resolve({ status: 204 })),
    put: jest.fn()
  }
}));

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() }
}));

jest.mock("../../errors/toastError", () => jest.fn());

// The dialog renders in a portal, outside the render container.
const field = name => document.body.querySelector(`#email-account-${name}`);

const fill = values =>
  Object.entries(values).forEach(([name, value]) =>
    fireEvent.change(field(name), { target: { value } })
  );

const testConnection = async values => {
  fill({
    address: "contato@empresa.com.br",
    password: "segredo",
    imapHost: "imap.empresa.com.br",
    smtpHost: "smtp.empresa.com.br",
    ...values
  });
  await act(async () => {
    fireEvent.click(
      screen
        .getByText(i18n.t("emailChannel.connections.form.test"))
        .closest("button")
    );
  });
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  const [url, body] = api.post.mock.calls[0];
  expect(url).toBe("/email/accounts/test");
  return body;
};

describe("EmailAccountModal custom servers", () => {
  beforeAll(() => i18n.changeLanguage("pt"));
  beforeEach(() => jest.clearAllMocks());

  const renderCustom = () =>
    render(
      <EmailAccountModal
        open
        onClose={jest.fn()}
        mode="create"
        preset="custom"
      />
    );

  it("sends IMAP 993 as TLS and SMTP 587 as STARTTLS", async () => {
    renderCustom();
    const body = await testConnection({
      imapPort: "993",
      smtpPort: "587"
    });
    expect(body.imap).toEqual({
      host: "imap.empresa.com.br",
      port: 993,
      secure: true
    });
    expect(body.smtp).toEqual({
      host: "smtp.empresa.com.br",
      port: 587,
      secure: false
    });
  });

  it("sends IMAP 993 and SMTP 465 both as TLS", async () => {
    renderCustom();
    const body = await testConnection({
      imapPort: "993",
      smtpPort: "465"
    });
    expect(body.imap.secure).toBe(true);
    expect(body.smtp.secure).toBe(true);
    expect(body.smtp.port).toBe(465);
  });

  it("keeps the checkbox as a port preset toggle", () => {
    const { getByLabelText } = renderCustom();
    expect(field("imapPort").value).toBe("993");
    expect(field("smtpPort").value).toBe("465");
    fireEvent.click(
      getByLabelText(i18n.t("emailChannel.connections.form.custom.secure"))
    );
    expect(field("imapPort").value).toBe("143");
    expect(field("smtpPort").value).toBe("587");
  });
});

describe("secureForPort", () => {
  it("decides the well-known ports per server and falls back to the checkbox", () => {
    expect(secureForPort("imap", "993", false)).toBe(true);
    expect(secureForPort("imap", 143, true)).toBe(false);
    expect(secureForPort("smtp", "465", false)).toBe(true);
    expect(secureForPort("smtp", "587", true)).toBe(false);
    // SMTP 993 / IMAP 465 are not well-known for that server
    expect(secureForPort("smtp", "993", false)).toBe(false);
    expect(secureForPort("imap", "1993", true)).toBe(true);
    expect(secureForPort("smtp", "2525", false)).toBe(false);
  });
});
