import express from "express";
import rateLimit from "express-rate-limit";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import isBillingAdmin from "../middleware/isBillingAdmin";
import * as FiscalNoteController from "../controllers/FiscalNoteController";

const fiscalNoteRoutes = express.Router();

const zipCodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limit_exceeded" }
});

// Registrado antes de companyRoutes: "/companies/fiscal-data" não pode cair
// em "/companies/:id".
fiscalNoteRoutes.get(
  "/companies/fiscal-data",
  isAuth,
  isAdmin,
  FiscalNoteController.showOwnFiscalData
);
fiscalNoteRoutes.put(
  "/companies/fiscal-data",
  isAuth,
  isAdmin,
  FiscalNoteController.updateOwnFiscalData
);
fiscalNoteRoutes.get(
  "/fiscal-data/cep/:cep",
  isAuth,
  zipCodeLimiter,
  FiscalNoteController.zipCode
);
fiscalNoteRoutes.get(
  "/invoices/:id/fiscal-note/:kind",
  isAuth,
  isAdmin,
  FiscalNoteController.ownDocument
);

fiscalNoteRoutes.get(
  "/billing-admin/clients/:companyId/fiscal-data",
  isAuth,
  isBillingAdmin,
  FiscalNoteController.showClientFiscalData
);
fiscalNoteRoutes.put(
  "/billing-admin/clients/:companyId/fiscal-data",
  isAuth,
  isBillingAdmin,
  FiscalNoteController.updateClientFiscalData
);
fiscalNoteRoutes.get(
  "/billing-admin/invoices/:id/fiscal-note/preview",
  isAuth,
  isBillingAdmin,
  FiscalNoteController.preview
);
fiscalNoteRoutes.post(
  "/billing-admin/invoices/:id/fiscal-note",
  isAuth,
  isBillingAdmin,
  FiscalNoteController.emit
);
fiscalNoteRoutes.post(
  "/billing-admin/invoices/:id/fiscal-note/cancel",
  isAuth,
  isBillingAdmin,
  FiscalNoteController.cancel
);
fiscalNoteRoutes.get(
  "/billing-admin/invoices/:id/fiscal-note/:kind",
  isAuth,
  isBillingAdmin,
  FiscalNoteController.clientDocument
);

fiscalNoteRoutes.post("/webhooks/notaas", FiscalNoteController.webhook);

export default fiscalNoteRoutes;
