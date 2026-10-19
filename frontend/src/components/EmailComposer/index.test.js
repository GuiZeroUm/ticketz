import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { toast } from "react-toastify";
import EmailComposer from ".";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() }
}));

jest.mock("../../errors/toastError", () => jest.fn());

const ticket = { id: 7, status: "open", subject: "Proposta" };

const threadWith = status => ({
  subject: "Proposta",
  account: {
    id: 1,
    name: "Contato",
    address: "contato@empresa.com",
    preset: "custom",
    status
  },
  messages: [
    {
      direction: "in",
      from: { address: "carla@cliente.com", name: "Carla" },
      to: [{ address: "contato@empresa.com" }],
      cc: []
    }
  ]
});

const sendLabel = () => i18n.t("emailChannel.inbox.composer.send");

const typeBody = text =>
  fireEvent.change(
    screen.getByPlaceholderText(
      i18n.t("emailChannel.inbox.composer.placeholder")
    ),
    { target: { value: text } }
  );

const sentKey = call => call[1].get("idempotencyKey");

describe("EmailComposer", () => {
  beforeAll(() => i18n.changeLanguage("pt"));
  beforeEach(() => jest.clearAllMocks());

  it("reuses the idempotency key after a failed send and renews it after a 2xx", async () => {
    api.post
      .mockRejectedValueOnce({
        response: { data: { error: "ERR_EMAIL_TRANSIENT" } }
      })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 });
    const onSent = jest.fn();
    render(
      <EmailComposer
        ticket={ticket}
        thread={threadWith("active")}
        onSent={onSent}
      />
    );

    typeBody("Olá");
    await act(async () => {
      fireEvent.click(screen.getByText(sendLabel()));
    });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(
      i18n.t("backendErrors.ERR_EMAIL_TRANSIENT"),
      expect.anything()
    );
    expect(toast.error.mock.calls[0][0]).not.toMatch(/ERR_/);

    await act(async () => {
      fireEvent.click(screen.getByText(sendLabel()));
    });
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    const [first, retry] = api.post.mock.calls;
    expect(sentKey(retry)).toBe(sentKey(first));
    expect(retry[0]).toBe("/messages/7");
    expect(retry[1].get("to")).toBe("carla@cliente.com");
    expect(retry[1].get("mode")).toBe("reply");
    expect(retry[1].get("subject")).toBe("Re: Proposta");

    typeBody("Segundo e-mail");
    await act(async () => {
      fireEvent.click(screen.getByText(sendLabel()));
    });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(3));
    expect(sentKey(api.post.mock.calls[2])).not.toBe(sentKey(first));
  });

  it.each([
    ["reauth_required", "reauth"],
    ["connecting", "blocked.connecting"],
    ["error", "blocked.error"],
    ["disabled", "blocked.disabled"],
    ["something_new", "blocked.unavailable"]
  ])(
    "shows the reason banner and disables send when the account is %s",
    async (status, reasonKey) => {
      render(<EmailComposer ticket={ticket} thread={threadWith(status)} />);
      expect(
        screen.getByText(i18n.t(`emailChannel.inbox.composer.${reasonKey}`))
      ).toBeTruthy();
      expect(screen.getByRole("alert").textContent).not.toMatch(
        /emailChannel|ERR_/
      );
      typeBody("Olá");
      const button = screen.getByText(sendLabel()).closest("button");
      expect(button.disabled).toBe(true);
      await act(async () => {
        fireEvent.click(button);
      });
      expect(api.post).not.toHaveBeenCalled();
    }
  );

  it("does not block on the ticket account, which carries no status", () => {
    render(
      <EmailComposer
        ticket={{
          ...ticket,
          emailAccount: {
            id: 1,
            name: "Contato",
            address: "contato@empresa.com",
            preset: "custom"
          }
        }}
        thread={null}
      />
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("has no banner and an enabled send button for an active account", () => {
    render(<EmailComposer ticket={ticket} thread={threadWith("active")} />);
    expect(screen.queryByRole("alert")).toBeNull();
    typeBody("Olá");
    expect(screen.getByText(sendLabel()).closest("button").disabled).toBe(
      false
    );
  });
});
