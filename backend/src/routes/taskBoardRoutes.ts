import { Router } from "express";
import isAdmin from "../middleware/isAdmin";
import isAuth from "../middleware/isAuth";
import * as TaskBoardController from "../controllers/TaskBoardController";

const routes = Router();

routes.get("/task-board", isAuth, TaskBoardController.index);

routes.post(
  "/task-board/columns",
  isAuth,
  isAdmin,
  TaskBoardController.storeColumn
);
routes.put(
  "/task-board/columns/reorder",
  isAuth,
  isAdmin,
  TaskBoardController.orderColumns
);
routes.put(
  "/task-board/columns/:id",
  isAuth,
  isAdmin,
  TaskBoardController.editColumn
);
routes.delete(
  "/task-board/columns/:id",
  isAuth,
  isAdmin,
  TaskBoardController.removeColumn
);

routes.post("/task-board/tasks", isAuth, TaskBoardController.storeTask);
routes.put("/task-board/tasks/:id", isAuth, TaskBoardController.editTask);
routes.put("/task-board/tasks/:id/move", isAuth, TaskBoardController.move);
routes.delete("/task-board/tasks/:id", isAuth, TaskBoardController.removeTask);

export default routes;
