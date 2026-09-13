import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import AudioMessage, { audioTime } from "./index";
jest.mock("../../translate/i18n", () => ({ i18n: { t: key => key } }));
const mockDestroy = jest.fn();
const mockLoad = jest.fn(() => Promise.resolve());
jest.mock("wavesurfer.js", () => ({
  __esModule: true,
  default: {
    create: () => {
      const listeners = {};
      Promise.resolve()
        .then(() => mockLoad())
        .then(() => listeners.ready?.())
        .catch(error => listeners.error?.(error));
      return {
        on: (name, handler) => {
          listeners[name] = handler;
        },
        load: mockLoad,
        destroy: mockDestroy
      };
    }
  }
}));
beforeEach(() => {
  jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  jest
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockImplementation(() => Promise.resolve());
});
afterEach(() => jest.restoreAllMocks());
test("formats unknown, negative and long audio durations", () => {
  expect(audioTime(Infinity)).toBe("0:00");
  expect(audioTime(-2)).toBe("0:00");
  expect(audioTime(125.9)).toBe("2:05");
});
test("does not autoplay, changes speed, seeks and releases media", async () => {
  let result;
  await act(async () => {
    result = render(<AudioMessage src="/audio.ogg" />);
  });
  const media = screen.getByLabelText("chatExperience.audio");
  expect(media.play).not.toHaveBeenCalled();
  expect(mockLoad).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByLabelText("chatExperience.speed"));
  expect(media.playbackRate).toBe(1.5);
  Object.defineProperty(media, "duration", { configurable: true, value: 60 });
  fireEvent.loadedMetadata(media);
  fireEvent.change(screen.getByRole("slider"), { target: { value: "20" } });
  expect(media.currentTime).toBe(20);
  await act(async () => {
    fireEvent.click(screen.getByLabelText("chatExperience.play"));
  });
  expect(media.play).toHaveBeenCalledTimes(1);
  result.unmount();
  expect(mockDestroy).toHaveBeenCalled();
});
test("keeps native playback available if waveform cannot load", async () => {
  mockLoad.mockRejectedValueOnce(new Error("CORS"));
  await act(async () => {
    render(<AudioMessage src="/cors-audio.ogg" />);
  });
  expect(screen.getByLabelText("chatExperience.audio").controls).toBe(true);
  expect(screen.getByText("chatExperience.audioFallback")).toBeTruthy();
});
