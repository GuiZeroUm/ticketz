import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "react-toastify";
import { makeStyles, alpha, useTheme } from "@material-ui/core/styles";
import CircularProgress from "@material-ui/core/CircularProgress";
import { AlertTriangle, FileText, Paperclip, Send, X } from "lucide-react";

import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import {
  CONNECTION_PROVIDERS,
  ChannelIcon,
  emailProviderKey,
  providerColors
} from "../../helpers/emailConnections";
import {
  MAX_OUTBOUND_ATTACHMENTS_BYTES,
  defaultRecipients,
  emailAccountBlockedReason,
  formatFileSize,
  replySubject,
  ti,
  toastEmailApiError,
  translateEmailSendError
} from "../../helpers/emailInbox";

const MODES = ["reply", "replyAll", "forward"];

const useStyles = makeStyles(theme => {
  const dark = theme.palette.type === "dark";
  const primary = theme.palette.primary.main;
  const border = dark ? theme.palette.divider : "#E4E4E7";
  const input = {
    minWidth: 0,
    height: 30,
    padding: "0 10px",
    border: `1px solid ${border}`,
    borderRadius: 8,
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
    font: "inherit",
    fontSize: 12.5,
    outline: "none",
    "&:focus": { borderColor: primary },
    "&:disabled": { opacity: 0.6 }
  };
  return {
    root: {
      flex: "none",
      borderTop: `1px solid ${border}`,
      background: theme.palette.background.paper,
      padding: "10px 14px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 8
    },
    warning: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 12px",
      borderRadius: 8,
      fontSize: 12.5,
      fontWeight: 500,
      background: dark ? alpha("#F59E0B", 0.14) : "#FEF3C7",
      color: dark ? "#FCD34D" : "#92400E",
      border: `1px solid ${dark ? alpha("#F59E0B", 0.35) : "#FDE68A"}`,
      "& svg": { flex: "none" }
    },
    modes: {
      display: "flex",
      flexWrap: "wrap",
      gap: 4
    },
    mode: {
      height: 28,
      padding: "0 10px",
      borderRadius: 7,
      font: "inherit",
      fontSize: 12,
      fontWeight: 500,
      cursor: "pointer",
      background: theme.palette.background.paper,
      border: `1px solid ${border}`,
      color: theme.palette.text.primary
    },
    modeSelected: {
      fontWeight: 600,
      background: alpha(primary, 0.08),
      borderColor: primary,
      color: primary
    },
    fields: {
      display: "grid",
      gridTemplateColumns: "64px minmax(0, 1fr)",
      gap: "6px 8px",
      alignItems: "center",
      fontSize: 12.5
    },
    label: {
      color: theme.palette.text.secondary
    },
    from: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontWeight: 600,
      minWidth: 0,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    input,
    srOnly: {
      position: "absolute",
      width: 1,
      height: 1,
      overflow: "hidden",
      clip: "rect(0 0 0 0)"
    },
    textarea: {
      ...input,
      height: "auto",
      minHeight: 72,
      padding: "10px 12px",
      fontSize: 13,
      lineHeight: 1.45,
      resize: "vertical",
      width: "100%"
    },
    files: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    },
    file: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 30,
      maxWidth: "100%",
      padding: "0 4px 0 10px",
      border: `1px solid ${border}`,
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 500,
      "& > svg": { flex: "none", color: theme.palette.text.secondary }
    },
    fileName: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    fileSize: {
      color: theme.palette.text.secondary,
      fontWeight: 400,
      whiteSpace: "nowrap"
    },
    fileRemove: {
      width: 22,
      height: 22,
      border: 0,
      borderRadius: 6,
      background: "transparent",
      color: theme.palette.text.secondary,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0,
      "&:hover": { background: theme.palette.action.hover }
    },
    toolbar: {
      display: "flex",
      alignItems: "center",
      gap: 4
    },
    tool: {
      width: 32,
      height: 32,
      border: 0,
      borderRadius: 8,
      background: "transparent",
      color: theme.palette.text.secondary,
      font: "inherit",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      "&:hover": { background: theme.palette.action.hover },
      "&:disabled": { opacity: 0.45, cursor: "not-allowed" }
    },
    spacer: { flex: 1 },
    send: {
      display: "flex",
      alignItems: "center",
      gap: 7,
      height: 36,
      padding: "0 16px",
      border: 0,
      borderRadius: 8,
      background: primary,
      color: theme.palette.primary.contrastText,
      font: "inherit",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      "&:hover": { filter: "brightness(0.92)" },
      "&:disabled": { opacity: 0.45, cursor: "not-allowed", filter: "none" }
    }
  };
});

const EmailComposer = ({ ticket, thread, onSent }) => {
  const classes = useStyles();
  const theme = useTheme();
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  // One key per draft: a retry after a network error reuses it, so the
  // backend returns the same message instead of sending twice.
  const idempotencyKeyRef = useRef(uuidv4());

  const [mode, setMode] = useState("reply");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [touched, setTouched] = useState({});
  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);

  const account = thread?.account || ticket?.emailAccount || null;
  const blockedReason = emailAccountBlockedReason(account);
  const blocked = Boolean(blockedReason);
  const closed = ticket?.status === "closed";
  const baseSubject = thread?.subject || ticket?.subject || "";

  const defaults = useMemo(() => {
    const recipients = defaultRecipients(thread, mode);
    return { ...recipients, subject: replySubject(baseSubject, mode) };
  }, [thread, mode, baseSubject]);

  // Follow the defaults (new inbound email, mode switch) until the user
  // edits a field.
  useEffect(() => {
    if (!touched.to) setTo(defaults.to);
    if (!touched.cc) setCc(defaults.cc);
    if (!touched.subject) setSubject(defaults.subject);
  }, [defaults, touched]);

  const providerKey = emailProviderKey(account);
  const provider = CONNECTION_PROVIDERS[providerKey];
  const { color: providerColor } = providerColors(theme, provider);

  const pickMode = next => {
    if (next === mode) return;
    setMode(next);
    setTouched({});
  };

  const editField = (field, setter) => event => {
    setter(event.target.value);
    setTouched(current => ({ ...current, [field]: true }));
  };

  const wrapSelection = marker => {
    const element = textareaRef.current;
    if (!element) return;
    const start = element.selectionStart ?? body.length;
    const end = element.selectionEnd ?? body.length;
    const next =
      body.slice(0, start) +
      marker +
      body.slice(start, end) +
      marker +
      body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + marker.length, end + marker.length);
    });
  };

  const addFiles = event => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    if (!picked.length) return;
    const next = [...files, ...picked];
    const total = next.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_OUTBOUND_ATTACHMENTS_BYTES) {
      toast.error(translateEmailSendError("ERR_EMAIL_ATTACHMENTS_TOO_LARGE"));
      return;
    }
    setFiles(next);
  };

  const removeFile = index =>
    setFiles(current => current.filter((_, i) => i !== index));

  const canSend =
    !sending &&
    !blocked &&
    !closed &&
    Boolean(account) &&
    (body.trim().length > 0 || files.length > 0 || mode === "forward");

  const send = async () => {
    if (!canSend) return;
    if (!to.trim()) {
      toast.error(translateEmailSendError("ERR_EMAIL_RECIPIENT_REQUIRED"));
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append("body", body);
      form.append("mode", mode);
      form.append("to", to.trim());
      if (cc.trim()) form.append("cc", cc.trim());
      form.append("subject", subject);
      form.append("idempotencyKey", idempotencyKeyRef.current);
      files.forEach(file => form.append("medias", file, file.name));
      await api.post(`/messages/${ticket.id}`, form);
      idempotencyKeyRef.current = uuidv4();
      setBody("");
      setFiles([]);
      setTouched({});
      if (onSent) onSent();
    } catch (err) {
      await toastEmailApiError(err);
    } finally {
      setSending(false);
    }
  };

  const fieldsDisabled = closed || blocked || sending;

  return (
    <div className={classes.root}>
      {blocked && (
        <div className={classes.warning} role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          {ti(`composer.${blockedReason}`)}
        </div>
      )}
      <div
        className={classes.modes}
        role="tablist"
        aria-label={ti("composer.modesLabel")}
      >
        {MODES.map(item => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            className={`${classes.mode} ${
              mode === item ? classes.modeSelected : ""
            }`}
            onClick={() => pickMode(item)}
          >
            {ti(`composer.${item}`)}
          </button>
        ))}
      </div>
      <div className={classes.fields}>
        <span className={classes.label}>{ti("composer.from")}</span>
        <span
          className={classes.from}
          style={{ color: providerColor }}
          title={account ? `${account.name} <${account.address}>` : undefined}
        >
          <ChannelIcon name={provider.icon} size={13} strokeWidth={2} />
          {account ? `${account.name} <${account.address}>` : "—"}
        </span>
        <label htmlFor={`email-to-${ticket.id}`} className={classes.label}>
          {ti("composer.to")}
        </label>
        <input
          id={`email-to-${ticket.id}`}
          type="text"
          className={classes.input}
          value={to}
          onChange={editField("to", setTo)}
          placeholder={ti("composer.recipientsPlaceholder")}
          disabled={fieldsDisabled}
          autoComplete="off"
        />
        <label htmlFor={`email-cc-${ticket.id}`} className={classes.label}>
          {ti("composer.cc")}
        </label>
        <input
          id={`email-cc-${ticket.id}`}
          type="text"
          className={classes.input}
          value={cc}
          onChange={editField("cc", setCc)}
          placeholder={ti("composer.recipientsPlaceholder")}
          disabled={fieldsDisabled}
          autoComplete="off"
        />
        <label htmlFor={`email-subject-${ticket.id}`} className={classes.label}>
          {ti("composer.subject")}
        </label>
        <input
          id={`email-subject-${ticket.id}`}
          type="text"
          className={classes.input}
          value={subject}
          onChange={editField("subject", setSubject)}
          disabled={fieldsDisabled}
          autoComplete="off"
        />
      </div>
      <label style={{ display: "flex", flexDirection: "column" }}>
        <span className={classes.srOnly}>{ti("composer.body")}</span>
        <textarea
          ref={textareaRef}
          rows={3}
          className={classes.textarea}
          value={body}
          onChange={event => setBody(event.target.value)}
          placeholder={
            closed
              ? i18n.t("messagesInput.placeholderClosed")
              : ti("composer.placeholder")
          }
          disabled={fieldsDisabled}
        />
      </label>
      {files.length > 0 && (
        <div className={classes.files}>
          {files.map((file, index) => (
            <span
              key={`${file.name}-${file.size}-${index}`}
              className={classes.file}
            >
              <FileText size={14} aria-hidden="true" />
              <span className={classes.fileName}>{file.name}</span>
              <span className={classes.fileSize}>
                {formatFileSize(file.size)}
              </span>
              <button
                type="button"
                className={classes.fileRemove}
                onClick={() => removeFile(index)}
                aria-label={ti("composer.removeAttachment", {
                  name: file.name
                })}
                disabled={sending}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={classes.toolbar}>
        <button
          type="button"
          className={classes.tool}
          style={{ fontWeight: 700 }}
          aria-label={ti("composer.bold")}
          title={ti("composer.bold")}
          onClick={() => wrapSelection("*")}
          disabled={fieldsDisabled}
        >
          B
        </button>
        <button
          type="button"
          className={classes.tool}
          style={{ fontStyle: "italic" }}
          aria-label={ti("composer.italic")}
          title={ti("composer.italic")}
          onClick={() => wrapSelection("_")}
          disabled={fieldsDisabled}
        >
          I
        </button>
        <button
          type="button"
          className={classes.tool}
          aria-label={ti("composer.attach")}
          title={ti("composer.attach")}
          onClick={() => fileInputRef.current?.click()}
          disabled={fieldsDisabled}
        >
          <Paperclip size={17} aria-hidden="true" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={addFiles}
        />
        <span className={classes.spacer} />
        <button
          type="button"
          className={classes.send}
          onClick={send}
          disabled={!canSend}
        >
          {sending ? (
            <CircularProgress size={15} color="inherit" aria-hidden="true" />
          ) : (
            <Send size={15} aria-hidden="true" />
          )}
          {sending ? ti("composer.sending") : ti("composer.send")}
        </button>
      </div>
    </div>
  );
};

export default EmailComposer;
