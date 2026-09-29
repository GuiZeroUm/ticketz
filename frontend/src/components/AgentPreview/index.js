import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@material-ui/core";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import "./styles.css";

const CHAT_LABEL_KEYS = [
  "badge",
  "connected",
  "progress",
  "error",
  "unavailable",
  "timeout",
  "cancelled",
  "invalidRequest",
  "sessionExpired",
  "permissionDenied",
  "busy",
  "notConfigured",
  "emptyReply",
  "retry",
  "placeholder"
];

const AVATAR_ANIMATIONS = new Set([
  "sleeping",
  "waking",
  "idle",
  "listening",
  "thinking",
  "searching",
  "working",
  "excited",
  "bored",
  "suspicious",
  "angry",
  "drowsy",
  "happy",
  "curious",
  "confused",
  "surprised",
  "proud",
  "shy",
  "sad",
  "laughing",
  "scared",
  "playful",
  "celebrate"
]);

const CHAT_ERROR_LABELS = {
  ERR_AGENT_CHAT_FAILED: "error",
  ERR_AGENT_INVALID_REQUEST: "invalidRequest",
  ERR_AGENT_CANCELLED: "cancelled",
  ERR_AGENT_BUSY: "busy",
  ERR_AGENT_RATE_LIMIT: "busy",
  ERR_HERMES_UNAVAILABLE: "unavailable",
  ERR_HERMES_TIMEOUT: "timeout",
  ERR_HERMES_NOT_CONFIGURED: "notConfigured",
  ERR_HERMES_EMPTY_REPLY: "emptyReply",
  ERR_SESSION_EXPIRED: "sessionExpired",
  ERR_AGENT_PERMISSION_DENIED: "permissionDenied"
};

function validChatIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}

function normalizeChatRequest(data) {
  if (
    !validChatIdentifier(data.conversationId) ||
    !Array.isArray(data.messages) ||
    data.messages.length === 0 ||
    data.messages.length > 40
  ) {
    return null;
  }

  const messages = [];
  let totalLength = 0;
  for (const message of data.messages) {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      message.content.trim().length === 0 ||
      message.content.length > 8000
    ) {
      return null;
    }

    totalLength += message.content.length;
    if (totalLength > 50000) return null;
    messages.push({ role: message.role, content: message.content });
  }

  if (messages[messages.length - 1].role !== "user") return null;
  return { conversationId: data.conversationId, messages };
}

function chatFailureCode(error) {
  if (error.code === "ERR_CANCELED") return "ERR_AGENT_CANCELLED";
  if (["ECONNABORTED", "ETIMEDOUT"].includes(error.code)) {
    return "ERR_HERMES_TIMEOUT";
  }

  const suppliedCode =
    error.response?.data?.code ||
    error.response?.data?.error ||
    error.response?.data?.message;
  if (Object.prototype.hasOwnProperty.call(CHAT_ERROR_LABELS, suppliedCode)) {
    return suppliedCode;
  }

  const status = error.response?.status;
  if (status === 401) return "ERR_SESSION_EXPIRED";
  if (status === 403) return "ERR_AGENT_PERMISSION_DENIED";
  if (status === 429) return "ERR_AGENT_RATE_LIMIT";
  if (status === 504) return "ERR_HERMES_TIMEOUT";
  if (!error.response || [502, 503].includes(status)) {
    return "ERR_HERMES_UNAVAILABLE";
  }
  return "ERR_AGENT_CHAT_FAILED";
}

const AgentPreview = ({
  collapsed = false,
  companyName = "",
  userName = ""
}) => {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [language, setLanguage] = useState(i18n.language);
  const frameRef = useRef(null);
  const launcherAvatarFrameRef = useRef(null);
  const avatarStateRef = useRef("idle");
  const launcherRef = useRef(null);
  const chatRequestsRef = useRef(new Map());
  const theme = useTheme();

  const notifyLauncherAvatar = useCallback(state => {
    avatarStateRef.current = state;
    launcherAvatarFrameRef.current?.contentWindow?.postMessage(
      { type: "agent-avatar-state", state },
      window.location.origin
    );
  }, []);

  const notifyFrame = useCallback(
    isOpen => {
      const target = frameRef.current?.contentWindow;
      if (!target) return;

      const firstName = userName.trim().split(/\s+/)[0];
      target.postMessage(
        {
          type: "agent-preview-context",
          companyName,
          userName,
          greeting: i18n.t("agentPreview.greeting", { name: firstName }),
          liveChat: true,
          chatLabels: Object.fromEntries(
            CHAT_LABEL_KEYS.map(key => [
              key,
              i18n.t(`agentPreview.chat.${key}`)
            ])
          )
        },
        window.location.origin
      );

      if (isOpen) {
        target.postMessage(
          { type: "agent-preview-open" },
          window.location.origin
        );
      }
    },
    [companyName, userName, language]
  );

  const closePanel = useCallback(() => {
    setOpen(false);
    setExpanded(false);
    launcherRef.current?.focus();
  }, []);

  const respondToChat = useCallback((target, requestId, payload) => {
    if (target !== frameRef.current?.contentWindow) return;
    target.postMessage(
      { type: "agent-preview-chat-response", requestId, ...payload },
      window.location.origin
    );
  }, []);

  const respondToChatError = useCallback(
    (target, requestId, code) => {
      respondToChat(target, requestId, {
        error: {
          code,
          message: i18n.t(
            `agentPreview.chat.${CHAT_ERROR_LABELS[code] || "error"}`
          )
        }
      });
    },
    [respondToChat]
  );

  const handleChatRequest = useCallback(
    async (data, target) => {
      if (!validChatIdentifier(data.requestId)) return;
      const { requestId } = data;
      if (chatRequestsRef.current.has(requestId)) return;

      const request = normalizeChatRequest(data);
      if (!request) {
        respondToChatError(target, requestId, "ERR_AGENT_INVALID_REQUEST");
        return;
      }
      if (chatRequestsRef.current.size >= 2) {
        respondToChatError(target, requestId, "ERR_AGENT_BUSY");
        return;
      }

      const controller = new AbortController();
      chatRequestsRef.current.set(requestId, controller);
      try {
        const { data: response } = await api.post("/agent/chat", request, {
          signal: controller.signal,
          timeout: 180000
        });

        if (controller.signal.aborted) {
          respondToChatError(target, requestId, "ERR_AGENT_CANCELLED");
        } else if (
          typeof response?.reply === "string" &&
          response.reply.trim().length > 0 &&
          response.reply.length <= 100000
        ) {
          respondToChat(target, requestId, { reply: response.reply });
        } else {
          respondToChatError(target, requestId, "ERR_HERMES_EMPTY_REPLY");
        }
      } catch (error) {
        respondToChatError(
          target,
          requestId,
          controller.signal.aborted
            ? "ERR_AGENT_CANCELLED"
            : chatFailureCode(error)
        );
      } finally {
        if (chatRequestsRef.current.get(requestId) === controller) {
          chatRequestsRef.current.delete(requestId);
        }
      }
    },
    [respondToChat, respondToChatError]
  );

  useEffect(() => {
    const requests = chatRequestsRef.current;
    return () => {
      requests.forEach(controller => controller.abort());
      requests.clear();
    };
  }, []);

  useEffect(() => {
    const handleLanguage = language => setLanguage(language);
    i18n.on("languageChanged", handleLanguage);
    return () => i18n.off("languageChanged", handleLanguage);
  }, []);

  useEffect(() => {
    const handleMessage = event => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow
      ) {
        return;
      }

      if (event.data?.type === "agent-preview-close") {
        closePanel();
      }

      if (event.data?.type === "agent-preview-expand") {
        setExpanded(Boolean(event.data.expanded));
      }

      if (
        event.data?.type === "agent-preview-state" &&
        AVATAR_ANIMATIONS.has(event.data.state)
      ) {
        notifyLauncherAvatar(event.data.state);
      }

      if (event.data?.type === "agent-preview-chat-request") {
        handleChatRequest(event.data, event.source);
      }

      if (
        event.data?.type === "agent-preview-chat-cancel" &&
        validChatIdentifier(event.data.requestId)
      ) {
        chatRequestsRef.current.get(event.data.requestId)?.abort();
      }
    };

    const handleEscape = event => {
      if (event.key === "Escape" && open) {
        closePanel();
      }
    };

    window.addEventListener("message", handleMessage);
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, closePanel, notifyLauncherAvatar, handleChatRequest]);

  useEffect(() => {
    if (hasOpened) {
      notifyFrame(open);
    }
  }, [open, hasOpened, notifyFrame]);

  const togglePanel = () => {
    if (open) {
      closePanel();
      return;
    }

    setHasOpened(true);
    setOpen(true);
  };

  const launcherStyle = {
    "--agent-preview-surface": theme.palette.background.paper,
    "--agent-preview-ink": theme.palette.text.primary,
    "--agent-preview-muted": theme.palette.text.secondary
  };

  return (
    <>
      <button
        ref={launcherRef}
        className={`agent-preview-launcher${open ? " agent-preview-launcher--open" : ""}${collapsed ? " agent-preview-launcher--collapsed" : ""}`}
        style={launcherStyle}
        onClick={togglePanel}
        type="button"
        aria-label={i18n.t("agentPreview.launcher")}
        aria-expanded={open}
        aria-controls="agent-preview-panel"
      >
        <span className="agent-preview-launcher-orb" aria-hidden="true">
          <iframe
            ref={launcherAvatarFrameRef}
            src="/agent-preview/kirby.html"
            title={i18n.t("agentPreview.avatarTitle")}
            tabIndex={-1}
            aria-hidden="true"
            onLoad={() => notifyLauncherAvatar(avatarStateRef.current)}
          />
        </span>
        <span className="agent-preview-launcher-copy">
          <strong>{i18n.t("agentPreview.launcher")}</strong>
          <span>{i18n.t("agentPreview.subtitle")}</span>
        </span>
        <svg
          className="agent-preview-launcher-arrow"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
      {hasOpened &&
        createPortal(
          <section
            className={`agent-preview-panel${expanded ? " agent-preview-panel--expanded" : ""}`}
            id="agent-preview-panel"
            role="dialog"
            aria-modal="false"
            aria-label={i18n.t("agentPreview.panel")}
            hidden={!open}
          >
            <iframe
              className="agent-preview-panel-frame"
              ref={frameRef}
              src="/agent-preview/?embedded=1"
              title={i18n.t("agentPreview.panel")}
              onLoad={() => notifyFrame(open)}
            />
          </section>,
          document.body
        )}
    </>
  );
};

export default AgentPreview;
