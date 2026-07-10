import { Router } from "express";

import * as LinkPreviewController from "../controllers/LinkPreviewController";

const linkPreviewRoutes = Router();

// Consumida pelos robos de pre-visualizacao de link (roteados pelo nginx).
linkPreviewRoutes.get("/link-preview", LinkPreviewController.preview);

export default linkPreviewRoutes;
