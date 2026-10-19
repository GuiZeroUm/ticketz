import { Router } from "express";
import * as GmailPushController from "../controllers/GmailPushController";

const gmailPushRoutes = Router();

// Public on purpose (no isAuth): the caller is Google Pub/Sub, authenticated
// by the OIDC token it signs (checked in the controller). The small body
// parser also runs here so the router works on its own; app.ts mounts it
// before the global JSON parser too (see GmailPushController).
gmailPushRoutes.post(
  GmailPushController.GMAIL_PUSH_PATH,
  GmailPushController.gmailPushBodyParser,
  GmailPushController.push
);

export default gmailPushRoutes;
