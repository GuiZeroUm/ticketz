import express from "express";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import * as MetaWhatsAppController from "../controllers/MetaWhatsAppController";

const metaWhatsappRoutes = express.Router();

metaWhatsappRoutes.get(
  "/whatsapp/meta/config",
  isAuth,
  MetaWhatsAppController.getConfig
);

metaWhatsappRoutes.post(
  "/whatsapp/:whatsappId/meta/connect",
  isAuth,
  isAdmin,
  MetaWhatsAppController.connect
);

export default metaWhatsappRoutes;
