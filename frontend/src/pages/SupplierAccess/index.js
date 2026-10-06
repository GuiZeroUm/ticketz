import { useEffect } from "react";
import { CircularProgress } from "@material-ui/core";
import { useHistory } from "react-router-dom";
import api from "../../services/api";
import { setStoredToken } from "../../helpers/token";
import { isSupplierPortal } from "../../helpers/supplierPortal";

const SupplierAccess = () => {
  const history = useHistory();

  useEffect(() => {
    if (!isSupplierPortal()) {
      history.replace("/login");
      return;
    }
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", "/fornecedores/entrar");
    if (!token) {
      history.replace("/login");
      return;
    }
    api
      .post("/auth/fornecedores/trocar", { token })
      .then(({ data }) => {
        setStoredToken(data.token);
        localStorage.setItem("companyId", String(data.user.companyId));
        localStorage.setItem("userId", String(data.user.id));
        window.location.replace("/tickets");
      })
      .catch(() => history.replace("/login"));
  }, [history]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <CircularProgress />
    </div>
  );
};

export default SupplierAccess;
