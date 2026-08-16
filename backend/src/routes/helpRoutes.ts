import express from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";

import * as HelpController from "../controllers/HelpController";

const routes = express.Router();

routes.get("/helps/list", isAuth, HelpController.findList);

// Conteudos de um card, para a tela do tenant.
routes.get("/helps/groups/:id", isAuth, HelpController.showGroupContents);

routes.get("/helps", isAuth, HelpController.index);

routes.post("/helps", isAuth, isSuper, HelpController.store);

// Antes de "/:id": senao "reorder" seria lido como um id.
routes.put("/helps/reorder", isAuth, isSuper, HelpController.reorder);

routes.get("/helps/:id", isAuth, HelpController.show);

routes.put("/helps/:id", isAuth, isSuper, HelpController.update);

routes.delete("/helps/:id", isAuth, isSuper, HelpController.remove);

export default routes;
