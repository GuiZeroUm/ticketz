import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import uploadConfig from "../config/upload";

import * as MessageController from "../controllers/MessageController";
import isCompliant from "../middleware/isCompliant";
import * as BillingPdfController from "../controllers/BillingPdfController";

const messageRoutes = Router();

const upload = multer(uploadConfig);

messageRoutes.get(
  "/tickets/:ticketId/messages/:messageId/billing-pdf",
  isAuth,
  isCompliant,
  BillingPdfController.show
);

messageRoutes.post(
  "/messages/forward",
  isAuth,
  isCompliant,
  MessageController.forward
);

messageRoutes.get(
  "/messages/:ticketId",
  isAuth,
  isCompliant,
  MessageController.index
);

messageRoutes.get(
  "/messages/:messageId/history",
  isAuth,
  isCompliant,
  MessageController.historyByMessageId
);

messageRoutes.post(
  "/messages/:ticketId",
  isAuth,
  isCompliant,
  upload.array("medias"),
  MessageController.store
);

messageRoutes.post(
  "/messages/:ticketId/template",
  isAuth,
  isCompliant,
  MessageController.storeTemplate
);

messageRoutes.post(
  "/messages/edit/:messageId",
  isAuth,
  isCompliant,
  MessageController.edit
);

messageRoutes.post(
  "/messages/react/:messageId",
  isAuth,
  isCompliant,
  MessageController.react
);

messageRoutes.delete(
  "/messages/:messageId",
  isAuth,
  isCompliant,
  MessageController.remove
);

export default messageRoutes;
