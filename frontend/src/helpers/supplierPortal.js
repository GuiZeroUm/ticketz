import config from "../services/config";

export const isSupplierPortal = () => config.ACNORTE_SUPPLIER_PORTAL === "true";
