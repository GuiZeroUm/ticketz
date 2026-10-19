import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AddConnectionModal from ".";
import { i18n } from "../../translate/i18n";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

jest.mock("../../errors/toastError", () => jest.fn());

const tc = key => i18n.t(`emailChannel.connections.${key}`);

const gmailOption = () =>
  screen.getByText(tc("picker.options.gmail.label")).closest("button");

describe("AddConnectionModal Gmail option", () => {
  beforeAll(() => i18n.changeLanguage("pt"));

  it("offers Gmail when the server has it configured (or does not say)", () => {
    const onPickEmail = jest.fn();
    render(
      <AddConnectionModal
        open
        onClose={jest.fn()}
        whatsappMode="normal"
        onPickWhatsApp={jest.fn()}
        onPickEmail={onPickEmail}
      />
    );
    expect(screen.queryByText(tc("picker.gmailUnavailable.hint"))).toBeNull();
    fireEvent.click(gmailOption());
    expect(onPickEmail).toHaveBeenCalledWith("gmail");
  });

  it("shows Gmail disabled with the reason when it is not configured", () => {
    const onPickEmail = jest.fn();
    render(
      <AddConnectionModal
        open
        onClose={jest.fn()}
        whatsappMode="meta"
        gmailConfigured={false}
        onPickWhatsApp={jest.fn()}
        onPickEmail={onPickEmail}
      />
    );
    expect(screen.getByText(tc("picker.gmailUnavailable.hint"))).toBeTruthy();
    expect(screen.getByText(tc("picker.gmailUnavailable.tag"))).toBeTruthy();
    expect(gmailOption().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(gmailOption());
    expect(onPickEmail).not.toHaveBeenCalled();
    // the other email providers stay available
    fireEvent.click(
      screen.getByText(tc("picker.options.icloud.label")).closest("button")
    );
    expect(onPickEmail).toHaveBeenCalledWith("icloud");
  });
});
