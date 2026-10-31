import React from "react";
import { render } from "@testing-library/react";
import useTrailingCallback from "./useTrailingCallback";

function renderTrailing(callback, delayMs) {
  const result = {};
  function Probe({ callback: cb }) {
    result.current = useTrailingCallback(cb, delayMs);
    return null;
  }
  const view = render(<Probe callback={callback} />);
  return {
    result,
    unmount: view.unmount,
    rerender: next => view.rerender(<Probe callback={next} />)
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("coalesces bursts", () => {
  const cb = jest.fn();
  const { result } = renderTrailing(cb, 1000);
  result.current();
  result.current();
  result.current();
  expect(cb).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1000);
  expect(cb).toHaveBeenCalledTimes(1);
});

it("runs again for a later burst", () => {
  const cb = jest.fn();
  const { result } = renderTrailing(cb, 1000);
  result.current();
  jest.advanceTimersByTime(1000);
  result.current();
  jest.advanceTimersByTime(1000);
  expect(cb).toHaveBeenCalledTimes(2);
});

it("cancels on unmount", () => {
  const cb = jest.fn();
  const { result, unmount } = renderTrailing(cb, 1000);
  result.current();
  unmount();
  jest.advanceTimersByTime(1000);
  expect(cb).not.toHaveBeenCalled();
});

it("runs the latest callback and keeps the returned function stable", () => {
  const first = jest.fn();
  const second = jest.fn();
  const { result, rerender } = renderTrailing(first, 1000);
  const trigger = result.current;
  trigger();
  rerender(second);
  expect(result.current).toBe(trigger);
  jest.advanceTimersByTime(1000);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});
