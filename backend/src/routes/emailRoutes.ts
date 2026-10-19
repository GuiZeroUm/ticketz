import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as EmailController from "../controllers/EmailController";

const emailRoutes = Router();

emailRoutes.get("/email/availability", isAuth, EmailController.availability);

export default emailRoutes;
