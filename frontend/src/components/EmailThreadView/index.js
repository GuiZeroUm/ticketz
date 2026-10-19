import React, { useEffect, useRef, useState } from "react";
import { makeStyles, alpha } from "@material-ui/core/styles";
import CircularProgress from "@material-ui/core/CircularProgress";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  FileText,
  FileX
} from "lucide-react";

import EmailHtmlFrame from "../EmailHtmlFrame";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import { corAvatarContato } from "../../helpers/coresAvatar";
import { getInitials } from "../../helpers/getInitials";
import {
  addressLabel,
  addressList,
  firstAddress,
  formatEmailDate,
  formatFileSize,
  ti,
  tiCount,
  toastEmailRequestError,
  translateEmailSendError
} from "../../helpers/emailInbox";

const useStyles = makeStyles(theme => {
  const dark = theme.palette.type === "dark";
  const primary = theme.palette.primary.main;
  return {
    thread: {
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      background: dark ? theme.palette.background.default : "#F3F4F6",
      padding: "16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      [theme.breakpoints.down("xs")]: { padding: "12px 10px" }
    },
    header: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    },
    subject: {
      margin: 0,
      fontSize: 16,
      fontWeight: 700,
      letterSpacing: "-0.01em",
      overflowWrap: "anywhere"
    },
    countBadge: {
      height: 20,
      padding: "0 7px",
      borderRadius: 6,
      background: dark ? alpha(theme.palette.text.primary, 0.12) : "#E4E4E7",
      color: dark ? theme.palette.text.primary : "#3F3F46",
      fontSize: 11,
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      whiteSpace: "nowrap"
    },
    card: {
      background: theme.palette.background.paper,
      border: `1px solid ${dark ? theme.palette.divider : "#E4E4E7"}`,
      borderRadius: 12,
      padding: "14px 16px",
      minWidth: 0
    },
    cardOut: {
      background: dark ? alpha(primary, 0.1) : alpha(primary, 0.04),
      borderColor: alpha(primary, dark ? 0.35 : 0.17)
    },
    cardHead: {
      display: "flex",
      alignItems: "flex-start",
      gap: 10
    },
    avatar: {
      width: 32,
      height: 32,
      flex: "none",
      borderRadius: "50%",
      color: "#FFFFFF",
      fontSize: 11.5,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    avatarOut: {
      background: alpha(primary, dark ? 0.25 : 0.11),
      color: dark ? theme.palette.text.primary : primary
    },
    who: {
      flex: 1,
      minWidth: 0
    },
    fromLine: {
      fontSize: 13,
      overflowWrap: "anywhere"
    },
    fromName: {
      fontWeight: 600
    },
    muted: {
      color: theme.palette.text.secondary
    },
    toLine: {
      fontSize: 12,
      color: theme.palette.text.secondary,
      marginTop: 1,
      overflowWrap: "anywhere"
    },
    meta: {
      flex: "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 4
    },
    date: {
      fontSize: 11.5,
      color: theme.palette.text.secondary,
      whiteSpace: "nowrap"
    },
    status: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: "nowrap",
      maxWidth: 260,
      "& span": {
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    },
    statusQueued: { color: theme.palette.text.secondary },
    statusSent: { color: dark ? "#4ADE80" : "#16A34A" },
    statusFailed: { color: theme.palette.error.main },
    statusUnknown: { color: dark ? "#FBBF24" : "#B45309" },
    body: {
      marginTop: 12,
      fontSize: 13,
      lineHeight: 1.55,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere"
    },
    htmlBody: {
      marginTop: 12,
      // Email HTML assumes a light page; keep it readable on dark themes.
      ...(dark
        ? { background: "#FFFFFF", borderRadius: 8, padding: "10px 12px" }
        : {})
    },
    attachments: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 12
    },
    attachment: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      minHeight: 30,
      maxWidth: "100%",
      padding: "0 10px",
      border: `1px solid ${dark ? theme.palette.divider : "#E4E4E7"}`,
      borderRadius: 8,
      background: theme.palette.background.paper,
      color: theme.palette.text.primary,
      font: "inherit",
      fontSize: 12,
      fontWeight: 500,
      cursor: "pointer",
      "&:hover": { borderColor: primary },
      "&:disabled": { cursor: "progress", opacity: 0.7 },
      "& svg": { flex: "none", color: theme.palette.text.secondary }
    },
    attachmentName: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    attachmentSkipped: {
      cursor: "default",
      borderStyle: "dashed",
      color: theme.palette.text.secondary,
      "&:hover": { borderColor: theme.palette.divider }
    },
    attachmentSize: {
      color: theme.palette.text.secondary,
      fontWeight: 400,
      whiteSpace: "nowrap"
    },
    placeholder: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: 40,
      textAlign: "center",
      color: theme.palette.text.secondary
    },
    retry: {
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: 8,
      background: theme.palette.background.paper,
      color: theme.palette.text.primary,
      font: "inherit",
      fontSize: 12.5,
      fontWeight: 500,
      padding: "6px 12px",
      cursor: "pointer"
    }
  };
});

const STATUS_ICONS = {
  queued: Clock,
  sent: Check,
  failed: AlertCircle,
  unknown: AlertTriangle
};

const SendStatus = ({ message }) => {
  const classes = useStyles();
  const status = message.sendStatus;
  if (message.direction !== "out" || !STATUS_ICONS[status]) return null;
  const Icon = STATUS_ICONS[status];
  const code = message.sendError?.code || message.error?.code || null;
  let label = ti(`status.${status}`);
  let title = label;
  if (status === "failed" && code) {
    label = ti("status.failedWithReason", {
      reason: translateEmailSendError(code)
    });
    title = label;
  }
  if (status === "unknown") title = ti("status.unknownHint");
  const tone = {
    queued: classes.statusQueued,
    sent: classes.statusSent,
    failed: classes.statusFailed,
    unknown: classes.statusUnknown
  }[status];
  return (
    <span className={`${classes.status} ${tone}`} title={title}>
      <Icon size={12} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};

const Attachment = ({ attachment }) => {
  const classes = useStyles();
  const [busy, setBusy] = useState(false);
  const name = attachment.filename || attachment.id;
  const size = formatFileSize(attachment.size);

  if (attachment.skippedReason) {
    return (
      <span
        className={`${classes.attachment} ${classes.attachmentSkipped}`}
        title={name}
      >
        <FileX size={14} aria-hidden="true" />
        <span className={classes.attachmentName}>{name}</span>
        <span className={classes.attachmentSize}>
          {ti("thread.attachmentSkipped")}
        </span>
      </span>
    );
  }

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.get(`/email/attachments/${attachment.id}`, {
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename || "attachment";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err) {
      await toastEmailRequestError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={classes.attachment}
      onClick={download}
      disabled={busy}
      aria-label={ti("thread.download", { name })}
      title={ti("thread.download", { name })}
    >
      {busy ? (
        <CircularProgress size={12} aria-hidden="true" />
      ) : (
        <FileText size={14} aria-hidden="true" />
      )}
      <span className={classes.attachmentName}>{name}</span>
      {size && <span className={classes.attachmentSize}>{size}</span>}
    </button>
  );
};

const EmailCard = ({ message, contactColor }) => {
  const classes = useStyles();
  const out = message.direction === "out";
  const from = firstAddress(message.from);
  const fromName = addressLabel(from);
  const to = addressList(message.to).map(addressLabel).join(", ");
  const cc = addressList(message.cc).map(addressLabel).join(", ");
  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : [];

  return (
    <article className={`${classes.card} ${out ? classes.cardOut : ""}`}>
      <div className={classes.cardHead}>
        <div
          aria-hidden="true"
          className={`${classes.avatar} ${out ? classes.avatarOut : ""}`}
          style={out ? undefined : { background: contactColor }}
        >
          {getInitials(fromName)}
        </div>
        <div className={classes.who}>
          <div className={classes.fromLine}>
            <span className={classes.fromName}>{fromName}</span>{" "}
            {from?.address && from.address !== fromName && (
              <span className={classes.muted}>&lt;{from.address}&gt;</span>
            )}
          </div>
          {(to || cc) && (
            <div className={classes.toLine}>
              {to && ti("thread.to", { list: to })}
              {to && cc && " · "}
              {cc && ti("thread.cc", { list: cc })}
            </div>
          )}
        </div>
        <div className={classes.meta}>
          <span className={classes.date}>{formatEmailDate(message.date)}</span>
          <SendStatus message={message} />
        </div>
      </div>
      {message.htmlSanitized ? (
        <div className={classes.htmlBody}>
          <EmailHtmlFrame
            html={message.htmlSanitized}
            title={ti("thread.frameTitle", { from: fromName })}
          />
        </div>
      ) : (
        message.text && <div className={classes.body}>{message.text}</div>
      )}
      {attachments.length > 0 && (
        <div className={classes.attachments}>
          {attachments.map(attachment => (
            <Attachment
              key={attachment.id || attachment.filename}
              attachment={attachment}
            />
          ))}
        </div>
      )}
    </article>
  );
};

const EmailThreadView = ({ ticket, thread, loading, error, onRetry }) => {
  const classes = useStyles();
  const scrollRef = useRef(null);
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const count = messages.length;
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (count > lastCountRef.current && scrollRef.current) {
      const element = scrollRef.current;
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    }
    lastCountRef.current = count;
  }, [count]);

  if (!thread) {
    return (
      <div className={classes.thread}>
        <div className={classes.placeholder} role="status">
          {loading || !error ? (
            <>
              <CircularProgress size={22} />
              {ti("thread.loading")}
            </>
          ) : (
            <>
              <span>
                {i18n.exists(`backendErrors.${error}`)
                  ? i18n.t(`backendErrors.${error}`)
                  : ti("thread.loadError")}
              </span>
              <button type="button" className={classes.retry} onClick={onRetry}>
                {ti("thread.retry")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const subject = thread.subject || ticket?.subject || ti("noSubject");
  const contactColor = corAvatarContato(ticket?.contact);

  return (
    <div className={classes.thread} ref={scrollRef}>
      <div className={classes.header}>
        <h2 className={classes.subject}>{subject}</h2>
        <span className={classes.countBadge}>
          {tiCount("thread.count", count)}
        </span>
      </div>
      {count === 0 && (
        <div className={classes.placeholder}>{ti("thread.empty")}</div>
      )}
      {messages.map((message, index) => (
        <EmailCard
          key={message.messageId || message.id || index}
          message={message}
          contactColor={contactColor}
        />
      ))}
    </div>
  );
};

export default EmailThreadView;
