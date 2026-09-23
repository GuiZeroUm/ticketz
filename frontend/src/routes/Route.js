import React, { useContext } from "react";
import { Route as RouterRoute, Redirect } from "react-router-dom";

import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";

const Route = ({
  component: Component,
  isPrivate = false,
  adminOnly = false,
  ...rest
}) => {
  const { isAuth, loading, user } = useContext(AuthContext);

  if (!isAuth && isPrivate) {
    return (
      <>
        {loading && <BackdropLoading />}
        <Redirect to={{ pathname: "/login", state: { from: rest.location } }} />
      </>
    );
  }

  if (isAuth && !isPrivate) {
    return (
      <>
        {loading && <BackdropLoading />}
        <Redirect to={{ pathname: "/", state: { from: rest.location } }} />;
      </>
    );
  }

  if (isAuth && !loading && adminOnly && user?.profile !== "admin") {
    return <Redirect to="/tickets" />;
  }

  return (
    <>
      {loading && <BackdropLoading />}
      <RouterRoute {...rest} component={Component} />
    </>
  );
};

export default Route;
