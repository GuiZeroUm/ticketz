import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  makeStyles,
  Paper,
  TextField,
  Typography,
  useTheme
} from "@material-ui/core";
import { DateRange, Settings } from "@material-ui/icons";
import {
  KeyboardDatePicker,
  MuiPickersUtilsProvider
} from "@material-ui/pickers";
import DateFnsUtils from "@date-io/date-fns";
import { endOfDay, isValid, startOfDay } from "date-fns";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { AuthContext } from "../../context/Auth/AuthContext";
import { SocketContext } from "../../context/Socket/SocketContext";
import ConfirmationModal from "../../components/ConfirmationModal";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import toastError from "../../errors/toastError";
import { i18nToast } from "../../helpers/i18nToast";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import KanbanColumn from "./KanbanColumn";
import TaskBoardSettingsDialog from "./TaskBoardSettingsDialog";
import { optimisticMove, tasksInColumn } from "./taskBoardState";

const useStyles = makeStyles(theme => ({
  mainPaper: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
    overflow: "hidden",
    padding: theme.spacing(2),
    borderColor: theme.palette.divider,
    backgroundColor: theme.palette.background.paper
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(2)
  },
  addForm: {
    display: "flex",
    flex: "1 1 420px",
    gap: theme.spacing(1),
    minWidth: 260
  },
  taskInput: { flex: 1 },
  filters: {
    display: "flex",
    flex: "1 1 auto",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing(1)
  },
  dateField: { width: 150 },
  filterIcon: { color: theme.palette.text.secondary },
  board: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    gap: theme.spacing(2),
    overflowX: "auto",
    overflowY: "hidden",
    paddingBottom: theme.spacing(1),
    ...theme.scrollbarStyles
  },
  center: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing(1.5),
    color: theme.palette.text.secondary,
    textAlign: "center"
  },
  overlay: {
    width: 280,
    padding: theme.spacing(1.5),
    borderRadius: 8,
    backgroundColor: theme.palette.background.paper,
    boxShadow: theme.shadows[8],
    color: theme.palette.text.primary,
    fontSize: 14,
    fontWeight: 500,
    overflowWrap: "anywhere",
    transform: "rotate(2deg)"
  }
}));

const ToDoList = () => {
  const classes = useStyles();
  const theme = useTheme();
  const { user } = useContext(AuthContext);
  const socketManager = useContext(SocketContext);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [completedFrom, setCompletedFrom] = useState(null);
  const [completedTo, setCompletedTo] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [activeTask, setActiveTask] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 }
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchBoard = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const params = {};
        if (completedFrom && isValid(completedFrom)) {
          params.completedFrom = startOfDay(completedFrom).toISOString();
        }
        if (completedTo && isValid(completedTo)) {
          params.completedTo = endOfDay(completedTo).toISOString();
        }
        const { data } = await api.get("/task-board", { params });
        setColumns(data.columns || []);
        setTasks(data.tasks || []);
        setLoadError(false);
      } catch (err) {
        setLoadError(true);
        toastError(err);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [completedFrom, completedTo]
  );

  useEffect(() => {
    fetchBoard(true);
  }, [fetchBoard]);

  useEffect(() => {
    const socket = socketManager.GetSocket();
    const reload = () => fetchBoard(false);
    socket.on("taskBoard", reload);
    socket.on("wsRefreshRequired", reload);
    return () => {
      socket.off("taskBoard", reload);
      socket.off("wsRefreshRequired", reload);
    };
  }, [socketManager, fetchBoard]);

  const createTask = async event => {
    event?.preventDefault();
    if (!newTask.trim() || savingTask) return;
    setSavingTask(true);
    try {
      await api.post("/task-board/tasks", { title: newTask.trim() });
      setNewTask("");
      await fetchBoard(false);
      i18nToast.success("todolist.toasts.taskCreated");
    } catch (err) {
      toastError(err);
    } finally {
      setSavingTask(false);
    }
  };

  const saveEditedTask = async () => {
    if (!editingTask || !editingTitle.trim()) return;
    try {
      await api.put(`/task-board/tasks/${editingTask.id}`, {
        title: editingTitle.trim()
      });
      setEditingTask(null);
      setEditingTitle("");
      await fetchBoard(false);
      i18nToast.success("todolist.toasts.taskSaved");
    } catch (err) {
      toastError(err);
    }
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await api.delete(`/task-board/tasks/${taskToDelete.id}`);
      setTaskToDelete(null);
      await fetchBoard(false);
      i18nToast.success("todolist.toasts.taskDeleted");
    } catch (err) {
      toastError(err);
    }
  };

  const handleDragStart = event => {
    const id = String(event.active.id).replace("task-", "");
    setActiveTask(tasks.find(task => String(task.id) === id) || null);
  };

  const handleDragEnd = async event => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = Number(String(active.id).replace("task-", ""));
    const moving = tasks.find(task => Number(task.id) === taskId);
    if (!moving) return;

    const overData = over.data.current || {};
    const destinationColumn = columns.find(
      column => Number(column.id) === Number(overData.columnId)
    );
    if (!destinationColumn) return;

    const destinationTasks = tasksInColumn(tasks, destinationColumn.id);
    const overTaskId =
      overData.type === "task"
        ? Number(String(over.id).replace("task-", ""))
        : null;
    let destinationPosition = overTaskId
      ? destinationTasks.findIndex(task => Number(task.id) === overTaskId)
      : destinationTasks.length;
    if (destinationPosition < 0) destinationPosition = destinationTasks.length;

    const currentTasks = tasksInColumn(tasks, moving.columnId);
    const currentPosition = currentTasks.findIndex(
      task => task.id === moving.id
    );
    if (
      Number(moving.columnId) === Number(destinationColumn.id) &&
      currentPosition === destinationPosition
    ) {
      return;
    }

    const previous = tasks;
    setTasks(
      optimisticMove(tasks, taskId, destinationColumn, destinationPosition)
    );
    try {
      await api.put(`/task-board/tasks/${taskId}/move`, {
        columnId: destinationColumn.id,
        position: destinationPosition
      });
    } catch (err) {
      setTasks(previous);
      toastError(err);
      await fetchBoard(false);
    }
  };

  const themedColumns = columns.map(column => ({
    ...column,
    fallbackColor: theme.palette.primary.main,
    getContrastText: theme.palette.getContrastText
  }));

  return (
    <MainContainer>
      <MainHeader>
        <Title>{i18n.t("todolist.title")}</Title>
        <MainHeaderButtonsWrapper>
          {user?.profile === "admin" && (
            <Button
              color="primary"
              variant="outlined"
              startIcon={<Settings />}
              onClick={() => setSettingsOpen(true)}
            >
              {i18n.t("todolist.buttons.configure")}
            </Button>
          )}
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper className={classes.mainPaper} variant="outlined">
        <div className={classes.controls}>
          <form className={classes.addForm} onSubmit={createTask}>
            <TextField
              className={classes.taskInput}
              size="small"
              variant="outlined"
              label={i18n.t("todolist.form.name")}
              value={newTask}
              inputProps={{ maxLength: 255 }}
              onChange={event => setNewTask(event.target.value)}
            />
            <Button
              type="submit"
              color="primary"
              variant="contained"
              disabled={savingTask || !newTask.trim()}
            >
              {i18n.t("todolist.buttons.add")}
            </Button>
          </form>

          <MuiPickersUtilsProvider utils={DateFnsUtils}>
            <div className={classes.filters}>
              <DateRange className={classes.filterIcon} />
              <KeyboardDatePicker
                className={classes.dateField}
                size="small"
                inputVariant="outlined"
                format="dd/MM/yyyy"
                label={i18n.t("todolist.filters.from")}
                value={completedFrom}
                onChange={setCompletedFrom}
                clearable
                invalidDateMessage={i18n.t("todolist.filters.invalidDate")}
              />
              <KeyboardDatePicker
                className={classes.dateField}
                size="small"
                inputVariant="outlined"
                format="dd/MM/yyyy"
                label={i18n.t("todolist.filters.to")}
                value={completedTo}
                minDate={
                  completedFrom && isValid(completedFrom)
                    ? completedFrom
                    : undefined
                }
                onChange={setCompletedTo}
                clearable
                invalidDateMessage={i18n.t("todolist.filters.invalidDate")}
              />
              {(completedFrom || completedTo) && (
                <Button
                  size="small"
                  onClick={() => {
                    setCompletedFrom(null);
                    setCompletedTo(null);
                  }}
                >
                  {i18n.t("todolist.buttons.clearFilter")}
                </Button>
              )}
            </div>
          </MuiPickersUtilsProvider>
        </div>

        {loading && (
          <div className={classes.center}>
            <CircularProgress size={32} />
            <Typography>{i18n.t("todolist.loading")}</Typography>
          </div>
        )}

        {!loading && loadError && (
          <div className={classes.center}>
            <Typography>{i18n.t("todolist.loadError")}</Typography>
            <Button color="primary" onClick={() => fetchBoard(true)}>
              {i18n.t("todolist.buttons.tryAgain")}
            </Button>
          </div>
        )}

        {!loading && !loadError && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragCancel={() => setActiveTask(null)}
            onDragEnd={handleDragEnd}
          >
            <div className={classes.board}>
              {themedColumns.map(column => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  tasks={tasksInColumn(tasks, column.id)}
                  onEditTask={task => {
                    setEditingTask(task);
                    setEditingTitle(task.title);
                  }}
                  onDeleteTask={setTaskToDelete}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask ? (
                <Paper className={classes.overlay}>{activeTask.title}</Paper>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </Paper>

      <Dialog
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{i18n.t("todolist.editTaskTitle")}</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            fullWidth
            multiline
            rowsMin={2}
            variant="outlined"
            label={i18n.t("todolist.form.name")}
            value={editingTitle}
            inputProps={{ maxLength: 255 }}
            onChange={event => setEditingTitle(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingTask(null)}>
            {i18n.t("common.cancel")}
          </Button>
          <Button
            color="primary"
            variant="contained"
            disabled={!editingTitle.trim()}
            onClick={saveEditedTask}
          >
            {i18n.t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationModal
        open={!!taskToDelete}
        onClose={() => setTaskToDelete(null)}
        onConfirm={confirmDeleteTask}
        title={i18n.t("todolist.confirm.deleteTaskTitle")}
      >
        {i18n.t("todolist.confirm.deleteTask", {
          title: taskToDelete?.title || ""
        })}
      </ConfirmationModal>

      <TaskBoardSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        columns={themedColumns}
        onChanged={() => fetchBoard(false)}
      />
    </MainContainer>
  );
};

export default ToDoList;
