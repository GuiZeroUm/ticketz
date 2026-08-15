import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import { Button, CircularProgress } from "@material-ui/core";
import AddIcon from "@material-ui/icons/Add";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import useQueues from "../../hooks/useQueues";
import useSortableList from "../../hooks/useSortableList";
import ConfirmationModal from "../ConfirmationModal";
import FlowCanvas from "./FlowCanvas";
import MessageBubble from "./MessageBubble";
import OptionEditor from "./OptionEditor";

const ROOT = "root";

const useStyles = makeStyles(theme => {
  const wa = theme.palette.whatsapp;

  return {
    list: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      // Classes que o @shopify/draggable aplica durante o arrasto. O espelho é
      // inserido no próprio container, então basta estilizar por aqui.
      "& .draggable-source--is-dragging": { opacity: 0.22 },
      "& .draggable-mirror": {
        opacity: 0.96,
        boxShadow: "0 18px 38px rgba(17,27,33,.2)"
      }
    },
    greeting: {
      width: "94%",
      maxWidth: 390,
      marginBottom: 10,
      padding: 10,
      borderRadius: "14px 14px 14px 4px",
      backgroundColor: wa.bubbleMuted,
      color: wa.ink,
      fontSize: 12,
      lineHeight: "18px",
      whiteSpace: "pre-wrap",
      boxShadow: "0 0 0 1px rgba(17,27,33,.04), 0 1px 2px rgba(17,27,33,.12)"
    },
    empty: {
      padding: "36px 12px",
      textAlign: "center",
      color: wa.copy,
      fontSize: 12.5,
      lineHeight: "20px"
    },
    loading: { display: "flex", justifyContent: "center", padding: 36 },
    actions: { display: "flex", justifyContent: "center", marginTop: 14 },
    addButton: {
      borderRadius: 999,
      textTransform: "none",
      fontWeight: 600,
      color: "#fff",
      backgroundColor: wa.status,
      "&:hover": { backgroundColor: wa.status, filter: "brightness(1.06)" }
    }
  };
});

const move = (list, from, to) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/**
 * Editor do chatbot de uma fila.
 *
 * A árvore é navegada um nível por vez: cada tela é uma lista plana de balões
 * arrastáveis, e um balão com respostas leva para dentro da ramificação.
 * A ordem e o liga/desliga são persistidos em lote (`PUT /queue-options/reorder`);
 * a tecla que o cliente digita é derivada pelo backend, nunca enviada daqui.
 */
const ChatbotFlow = ({ queueId, greetingMessage }) => {
  const classes = useStyles();
  const { findAll: findAllQueues } = useQueues();

  // Um nível por chave: "root" ou o id da opção pai.
  const [levels, setLevels] = useState({});
  const [path, setPath] = useState([]);
  const [loading, setLoading] = useState(false);
  const [queues, setQueues] = useState([]);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [announcement, setAnnouncement] = useState("");

  const parent = path.length ? path[path.length - 1] : null;
  const levelKey = parent ? String(parent.id) : ROOT;
  const options = levels[levelKey] || [];

  const fetchLevel = useCallback(
    async (key, parentId) => {
      const { data } = await api.get("/queue-options", {
        // O backend usa parentId = -1 para dizer "raiz" (parentId nulo).
        params: { queueId, parentId: parentId || -1 }
      });
      setLevels(prev => ({ ...prev, [key]: data }));
      return data;
    },
    [queueId]
  );

  useEffect(() => {
    if (!queueId) return;
    let active = true;

    (async () => {
      setLoading(true);
      try {
        await fetchLevel(levelKey, parent?.id);
      } catch (err) {
        if (active) toastError(err);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, levelKey]);

  useEffect(() => {
    (async () => {
      try {
        setQueues(await findAllQueues());
      } catch (err) {
        toastError(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reordenar e alternar o switch usam o mesmo endpoint em lote: os dois mudam
  // a numeração de todo o nível.
  const persist = async next => {
    const previous = options;
    setLevels(prev => ({ ...prev, [levelKey]: next }));

    try {
      await api.put("/queue-options/reorder", {
        items: next.map((option, index) => ({
          id: option.id,
          order: index,
          isActive: option.isActive
        }))
      });
      // A resposta do reorder não traz o contador de respostas; recarregar o
      // nível é mais barato que reconciliar campo a campo.
      await fetchLevel(levelKey, parent?.id);
    } catch (err) {
      setLevels(prev => ({ ...prev, [levelKey]: previous }));
      toastError(err);
    }
  };

  const handleMove = (from, to) => {
    const next = move(options, from, to);
    setAnnouncement(
      i18n.t("chatbotFlow.moved", {
        title: options[from]?.title || "",
        position: to + 1,
        total: options.length
      })
    );
    persist(next);
  };

  const handleToggle = (option, isActive) =>
    persist(
      options.map(item =>
        item.id === option.id ? { ...item, isActive } : item
      )
    );

  const handleSave = async (values, attachment) => {
    try {
      let saved;

      if (editing.id) {
        const { data } = await api.put(`/queue-options/${editing.id}`, values);
        saved = data;
      } else {
        const { data } = await api.post("/queue-options", {
          ...values,
          queueId,
          parentId: parent ? parent.id : null
        });
        saved = data;
      }

      if (attachment) {
        const formData = new FormData();
        formData.append("file", attachment);
        await api.post(`/queue-options/${saved.id}/media-upload`, formData);
      }

      setEditing(null);
      await fetchLevel(levelKey, parent?.id);
      toast.success(i18n.t("chatbotFlow.toasts.saved"));
    } catch (err) {
      toastError(err);
    }
  };

  const handleRemoveMedia = async () => {
    if (!editing?.id) return;
    try {
      await api.delete(`/queue-options/${editing.id}/media-upload`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/queue-options/${confirmDelete.id}`);
      setConfirmDelete(null);
      setEditing(null);
      // A ramificação inteira some junto: descarta os níveis em cache.
      setLevels({});
      await fetchLevel(levelKey, parent?.id);
      toast.success(i18n.t("chatbotFlow.toasts.deleted"));
    } catch (err) {
      toastError(err);
    }
  };

  const listRef = useSortableList(handleMove, !loading && options.length > 1);

  const activeCount = options.filter(option => option.isActive).length;

  const renderBody = () => {
    if (loading) {
      return (
        <div className={classes.loading}>
          <CircularProgress size={28} />
        </div>
      );
    }

    return (
      <>
        {!parent && greetingMessage && (
          <div className={classes.greeting}>{greetingMessage}</div>
        )}

        {options.length === 0 ? (
          <div className={classes.empty}>
            {parent
              ? i18n.t("chatbotFlow.emptyBranch")
              : i18n.t("chatbotFlow.emptyRoot")}
          </div>
        ) : (
          <div className={classes.list} ref={listRef}>
            {options.map((option, index) => (
              <MessageBubble
                key={option.id}
                option={option}
                index={index}
                total={options.length}
                forwardQueueName={
                  queues.find(queue => queue.id === option.forwardQueueId)?.name
                }
                onToggle={isActive => handleToggle(option, isActive)}
                onEdit={() => setEditing(option)}
                onOpenBranch={() =>
                  setPath(prev => [
                    ...prev,
                    { id: option.id, title: option.title }
                  ])
                }
                onMove={handleMove}
              />
            ))}
          </div>
        )}

        <div className={classes.actions}>
          <Button
            variant="contained"
            disableElevation
            className={classes.addButton}
            startIcon={<AddIcon />}
            onClick={() => setEditing({})}
          >
            {parent
              ? i18n.t("chatbotFlow.addAnswer")
              : i18n.t("chatbotFlow.addOption")}
          </Button>
        </div>
      </>
    );
  };

  return (
    <>
      <OptionEditor
        open={!!editing}
        option={editing}
        queues={queues}
        currentQueueId={queueId}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        onDelete={() => setConfirmDelete(editing)}
        onRemoveMedia={handleRemoveMedia}
      />

      <ConfirmationModal
        open={!!confirmDelete}
        title={i18n.t("chatbotFlow.confirmDelete.title")}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
      >
        {i18n.t("chatbotFlow.confirmDelete.message")}
      </ConfirmationModal>

      <FlowCanvas
        activeCount={activeCount}
        totalCount={options.length}
        path={path}
        onNavigate={depth => setPath(prev => prev.slice(0, depth))}
        announcement={announcement}
      >
        {renderBody()}
      </FlowCanvas>
    </>
  );
};

export default ChatbotFlow;
