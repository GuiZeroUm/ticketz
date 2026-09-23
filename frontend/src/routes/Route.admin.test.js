import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route as RouterRoute, Switch } from "react-router-dom";
import Route from "./Route";
import { AuthContext } from "../context/Auth/AuthContext";

jest.mock("../context/Auth/AuthContext", () => ({
  AuthContext: require("react").createContext({})
}));

const AdminPage = () => <div>admin-page</div>;
const TicketsPage = () => <div>tickets-page</div>;

const renderRoute = profile =>
  render(
    <AuthContext.Provider
      value={{ isAuth: true, loading: false, user: { profile } }}
    >
      <MemoryRouter initialEntries={["/sga"]}>
        <Switch>
          <Route exact path="/sga" component={AdminPage} isPrivate adminOnly />
          <RouterRoute path="/tickets" component={TicketsPage} />
        </Switch>
      </MemoryRouter>
    </AuthContext.Provider>
  );

it("permite a rota administrativa para administradores", () => {
  renderRoute("admin");
  expect(screen.getByText("admin-page")).toBeTruthy();
});

it("redireciona atendentes para os tickets", () => {
  renderRoute("user");
  expect(screen.getByText("tickets-page")).toBeTruthy();
  expect(screen.queryByText("admin-page")).toBeNull();
});
