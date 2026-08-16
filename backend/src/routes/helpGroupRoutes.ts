import express from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";

import * as HelpGroupController from "../controllers/HelpGroupController";

const routes = express.Router();

routes.get("/help-groups", isAuth, isSuper, HelpGroupController.index);

routes.post("/help-groups", isAuth, isSuper, HelpGroupController.store);

// Antes de "/:id": senao "reorder" cai na rota de id (armadilha ja documentada
// em routes/queueRoutes.ts).
routes.put("/help-groups/reorder", isAuth, isSuper, HelpGroupController.reorder);

routes.get("/help-groups/:id", isAuth, isSuper, HelpGroupController.show);

routes.put("/help-groups/:id", isAuth, isSuper, HelpGroupController.update);

routes.delete("/help-groups/:id", isAuth, isSuper, HelpGroupController.remove);

export default routes;
