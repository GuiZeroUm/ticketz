import express from "express";
import isAuth from "../middleware/isAuth";
import isProspeccaoUser from "../middleware/isProspeccaoUser";

import * as ProspeccaoController from "../controllers/ProspeccaoController";

const prospeccaoRoutes = express.Router();

prospeccaoRoutes.use("/prospeccao", isAuth, isProspeccaoUser);

prospeccaoRoutes.get("/prospeccao/produtos", ProspeccaoController.produtos);
prospeccaoRoutes.post("/prospeccao/buscas", ProspeccaoController.store);
prospeccaoRoutes.get("/prospeccao/buscas/:jobId", ProspeccaoController.show);

export default prospeccaoRoutes;
