import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import ChunkErrorBoundary from "./index";

const Boom = ({ error }) => {
  throw error;
};

class Catcher extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <div data-testid="outer">{this.state.error.message}</div>
    ) : (
      this.props.children
    );
  }
}

const chunkError = () =>
  Object.assign(new Error("Loading chunk 7 failed."), {
    name: "ChunkLoadError"
  });

const originalLocation = window.location;
let reload;
let consoleError;

beforeEach(() => {
  reload = jest.fn();
  delete window.location;
  window.location = { reload };
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  window.location = originalLocation;
  consoleError.mockRestore();
});

it("renders its children when nothing fails", () => {
  render(
    <ChunkErrorBoundary>
      <p>ok</p>
    </ChunkErrorBoundary>
  );
  expect(screen.getByText("ok")).toBeTruthy();
});

it("shows the message and a reload button on a chunk load error", () => {
  render(
    <ChunkErrorBoundary>
      <Boom error={chunkError()} />
    </ChunkErrorBoundary>
  );
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button"));
  expect(reload).toHaveBeenCalledTimes(1);
});

it("recognizes the webpack message even without the error name", () => {
  render(
    <ChunkErrorBoundary>
      <Boom error={new Error("Loading chunk 3 failed.")} />
    </ChunkErrorBoundary>
  );
  expect(screen.getByRole("button")).toBeTruthy();
});

it("rethrows errors that are not chunk errors", () => {
  render(
    <Catcher>
      <ChunkErrorBoundary>
        <Boom error={new Error("regular bug")} />
      </ChunkErrorBoundary>
    </Catcher>
  );
  expect(screen.getByTestId("outer").textContent).toBe("regular bug");
  expect(screen.queryByRole("button")).toBeNull();
});

it("renders a custom fallback", () => {
  render(
    <ChunkErrorBoundary fallback={<span>custom</span>}>
      <Boom error={chunkError()} />
    </ChunkErrorBoundary>
  );
  expect(screen.getByText("custom")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("renders nothing for fallback={null}", () => {
  const { container } = render(
    <ChunkErrorBoundary fallback={null}>
      <Boom error={chunkError()} />
    </ChunkErrorBoundary>
  );
  expect(container.innerHTML).toBe("");
});
