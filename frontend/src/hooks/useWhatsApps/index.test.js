import React from "react";
import {
  act,
  render,
  screen,
  waitFor,
  fireEvent
} from "@testing-library/react";
import useWhatsApps from ".";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";

jest.mock("../../services/api", () => ({ get: jest.fn() }));
jest.mock("../../context/Auth/AuthContext", () => ({
  AuthContext: require("react").createContext()
}));
jest.mock("../../context/Socket/SocketContext", () => ({
  SocketContext: require("react").createContext({
    GetSocket: () => ({ on: () => {}, disconnect: () => {} })
  })
}));

const Probe = () => {
  const { whatsApps, loading, loadError, reload } = useWhatsApps();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{String(loadError)}</span>
      <span data-testid="connections">
        {whatsApps.map(w => w.name).join(",")}
      </span>
      <button onClick={reload}>Recarregar</button>
    </div>
  );
};

beforeEach(() => api.get.mockReset());

it("waits for a restored authenticated session before fetching connections", async () => {
  api.get.mockResolvedValueOnce({ data: [{ id: 6, name: "Espaço Whats" }] });
  const { rerender } = render(
    <AuthContext.Provider value={{ loading: true, isAuth: false, user: {} }}>
      <Probe />
    </AuthContext.Provider>
  );

  expect(api.get).not.toHaveBeenCalled();
  rerender(
    <AuthContext.Provider
      value={{ loading: false, isAuth: true, user: { companyId: 10 } }}
    >
      <Probe />
    </AuthContext.Provider>
  );

  await waitFor(() =>
    expect(screen.getByTestId("connections").textContent).toBe("Espaço Whats")
  );
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith("/whatsapp");
  expect(screen.getByTestId("loading").textContent).toBe("false");
});

it("shows a load failure and retries instead of presenting an empty list", async () => {
  api.get
    .mockRejectedValueOnce(new Error("unauthorized"))
    .mockResolvedValueOnce({ data: [{ id: 8, name: "Financeiro Singular" }] });
  render(
    <AuthContext.Provider
      value={{ loading: false, isAuth: true, user: { companyId: 10 } }}
    >
      <Probe />
    </AuthContext.Provider>
  );

  await waitFor(() =>
    expect(screen.getByTestId("error").textContent).toBe("true")
  );
  fireEvent.click(screen.getByRole("button", { name: "Recarregar" }));
  await waitFor(() =>
    expect(screen.getByTestId("connections").textContent).toBe(
      "Financeiro Singular"
    )
  );
  expect(screen.getByTestId("error").textContent).toBe("false");
  expect(api.get).toHaveBeenCalledTimes(2);
});

it("ignores a late response from a previous tenant", async () => {
  let finishPreviousRequest;
  api.get
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishPreviousRequest = resolve;
        })
    )
    .mockResolvedValueOnce({ data: [{ id: 1, name: "Teste" }] });

  const { rerender } = render(
    <AuthContext.Provider
      value={{ loading: false, isAuth: true, user: { companyId: 10 } }}
    >
      <Probe />
    </AuthContext.Provider>
  );
  rerender(
    <AuthContext.Provider
      value={{ loading: false, isAuth: true, user: { companyId: 1 } }}
    >
      <Probe />
    </AuthContext.Provider>
  );

  await waitFor(() =>
    expect(screen.getByTestId("connections").textContent).toBe("Teste")
  );
  await act(async () => {
    finishPreviousRequest({
      data: [{ id: 8, name: "Financeiro Singular" }]
    });
  });
  expect(screen.getByTestId("connections").textContent).toBe("Teste");
});
