import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import * as EmailController from "../controllers/EmailController";

const emailRoutes = Router();

emailRoutes.get("/email/availability", isAuth, EmailController.availability);

emailRoutes.get("/email/accounts", isAuth, isAdmin, EmailController.index);
emailRoutes.post("/email/accounts/test", isAuth, isAdmin, EmailController.test);
emailRoutes.post("/email/accounts", isAuth, isAdmin, EmailController.store);
emailRoutes.put("/email/accounts/:id", isAuth, isAdmin, EmailController.update);
emailRoutes.delete(
  "/email/accounts/:id",
  isAuth,
  isAdmin,
  EmailController.remove
);
emailRoutes.post(
  "/email/accounts/:id/sync",
  isAuth,
  isAdmin,
  EmailController.sync
);

emailRoutes.post(
  "/email/oauth/google/start",
  isAuth,
  isAdmin,
  EmailController.googleStart
);
emailRoutes.post(
  "/email/oauth/google/finish",
  isAuth,
  isAdmin,
  EmailController.googleFinish
);
// No isAuth: the browser comes back from Google; the state identifies the flow.
// It only parks the code; /finish (logged in) exchanges it.
emailRoutes.get("/email/oauth/google/callback", EmailController.googleCallback);

emailRoutes.get(
  "/email/tickets/:ticketId/thread",
  isAuth,
  EmailController.thread
);
emailRoutes.get("/email/attachments/:id", isAuth, EmailController.attachment);

export default emailRoutes;
