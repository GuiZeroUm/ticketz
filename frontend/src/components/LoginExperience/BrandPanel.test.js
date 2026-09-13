import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useMediaQuery } from "@material-ui/core";
import BrandPanel, { BrandLogo } from "./BrandPanel";

jest.mock("../../translate/i18n", () => ({ i18n: { t: key => key } }));
jest.mock("../../services/config", () => ({
  getBackendURL: () => "https://test.example/backend"
}));
jest.mock("@material-ui/core", () => ({
  ...jest.requireActual("@material-ui/core"),
  useMediaQuery: jest.fn()
}));
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ initial, animate, transition, ...props }) => <div {...props} />,
    path: ({ initial, animate, transition, ...props }) => <path {...props} />
  }
}));

let mutedSetter;
beforeAll(() => {
  // JSDOM fires volumechange synchronously during React's mount, unlike browsers.
  mutedSetter = jest
    .spyOn(HTMLMediaElement.prototype, "muted", "set")
    .mockImplementation(() => {});
});
afterAll(() => mutedSetter.mockRestore());
beforeEach(() => useMediaQuery.mockReturnValue(false));

test("uses the tenant logo, texts and uploaded background in the real preview", () => {
  const { container } = render(
    <BrandPanel
      preview
      settings={{
        appName: "AC Norte",
        appLogoDark: "branding/2/logo.png",
        loginHeadline: "Sua marca",
        loginDescription: "Sua mensagem",
        loginSidePanelImage: "branding/2/background.png"
      }}
    />
  );
  expect(
    screen.getByRole("img", { name: "AC Norte" }).getAttribute("src")
  ).toBe("https://test.example/backend/public/branding/2/logo.png");
  expect(screen.getByRole("heading", { name: "Sua marca" })).toBeTruthy();
  expect(screen.getByText("Sua mensagem")).toBeTruthy();
  expect(
    container.querySelector(".login-brand-media").getAttribute("src")
  ).toContain("branding/2/background.png");
  expect(screen.getByRole("complementary").className).toContain(
    "login-brand-panel--preview"
  );
});

test("uses Espaço Whats and translated defaults when no custom branding exists", () => {
  const { container } = render(<BrandPanel />);
  expect(screen.getByText("Espaço Whats")).toBeTruthy();
  expect(container.querySelector("img").getAttribute("src")).toBe(
    "/branding/espaco-whats.png"
  );
  expect(screen.getByText("loginExperience.headline")).toBeTruthy();
  expect(screen.getByText("loginExperience.description")).toBeTruthy();
});

test("falls back on a broken tenant logo and accepts a later valid replacement", () => {
  const { container, rerender } = render(
    <BrandLogo logo="/broken.png" name="Tenant" />
  );
  fireEvent.error(screen.getByRole("img", { name: "Tenant" }));
  expect(container.querySelector("img").getAttribute("src")).toBe(
    "/branding/espaco-whats.png"
  );
  expect(screen.getByText("Tenant")).toBeTruthy();
  rerender(<BrandLogo logo="/replacement.png" name="Tenant" />);
  expect(screen.getByRole("img", { name: "Tenant" }).getAttribute("src")).toBe(
    "/replacement.png"
  );
});

test("pause and resume control animated decorations and video autoplay together", () => {
  const { container } = render(
    <BrandPanel settings={{ loginBackgroundContent: "branding/2/video.mp4" }} />
  );
  expect(screen.getByRole("complementary").dataset.animated).toBe("true");
  expect(container.querySelector("video").autoplay).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "loginExperience.pauseMotion" })
  );
  expect(screen.getByRole("complementary").dataset.animated).toBe("false");
  expect(container.querySelector("video").autoplay).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "loginExperience.resumeMotion" })
  );
  expect(screen.getByRole("complementary").dataset.animated).toBe("true");
});

test("respects live reduced-motion preference and disables video autoplay", () => {
  const settings = { loginBackgroundContent: "branding/2/video.mp4" };
  const { container, rerender } = render(<BrandPanel settings={settings} />);
  useMediaQuery.mockReturnValue(true);
  rerender(<BrandPanel settings={settings} />);
  expect(screen.getByRole("complementary").dataset.animated).toBe("false");
  expect(container.querySelector("video").autoplay).toBe(false);
  expect(screen.queryByRole("button")).toBeNull();
});

test("minimal template stays static and has no motion toggle", () => {
  render(<BrandPanel settings={{ loginTemplate: "minimal" }} />);
  expect(screen.getByRole("complementary").dataset.animated).toBe("false");
  expect(screen.queryByRole("button")).toBeNull();
});
