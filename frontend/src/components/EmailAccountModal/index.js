import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import {
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  IconButton,
  MenuItem,
  TextField,
  Typography
} from "@material-ui/core";
import { ChevronLeft, Close } from "@material-ui/icons";

import api from "../../services/api";
import useQueues from "../../hooks/useQueues";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import {
  CONNECTION_PROVIDERS,
  ChannelIcon,
  emailProviderKey,
  providerColors,
  startGmailOAuth,
  toastEmailError
} from "../../helpers/emailConnections";

const useStyles = makeStyles(theme => ({
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: theme.spacing(2, 2.5),
    borderBottom: `1px solid ${theme.palette.divider}`
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  title: {
    fontSize: theme.isStardew ? 22 : 17,
    fontWeight: 700
  },
  subtitle: {
    marginTop: 4,
    color: theme.palette.text.secondary,
    fontSize: theme.isStardew ? 17 : 13,
    overflowWrap: "anywhere"
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: theme.spacing(2.5)
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    [theme.breakpoints.down("xs")]: {
      gridTemplateColumns: "minmax(0, 1fr)"
    }
  },
  gridServers: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0, 3fr) minmax(0, 1fr) minmax(0, 3fr) minmax(0, 1fr)",
    gap: 12,
    [theme.breakpoints.down("xs")]: {
      gridTemplateColumns: "minmax(0, 3fr) minmax(0, 1fr)"
    }
  },
  oauthBox: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 12,
    background: theme.palette.action.hover
  },
  oauthTitle: {
    fontWeight: 600,
    fontSize: theme.isStardew ? 17 : 13
  },
  steps: {
    margin: 0,
    paddingLeft: 18,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    color: theme.palette.text.primary,
    fontSize: theme.isStardew ? 16 : 12.5,
    lineHeight: 1.45
  },
  oauthButton: {
    alignSelf: "flex-start",
    gap: 8,
    textTransform: "none",
    fontWeight: 600,
    background: theme.palette.background.paper
  },
  help: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 10,
    background: theme.palette.action.hover,
    color: theme.palette.text.primary,
    fontSize: theme.isStardew ? 15 : 12,
    lineHeight: 1.45
  },
  footer: {
    padding: theme.spacing(1.75, 2.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    gap: 10,
    flexWrap: "wrap"
  },
  footerNote: {
    flex: 1,
    minWidth: 220,
    color: theme.palette.text.secondary,
    fontSize: theme.isStardew ? 15 : 12
  },
  progress: {
    marginLeft: 8
  }
}));

const t = (key, options) => i18n.t(`emailChannel.connections.${key}`, options);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECURE_PORTS = { imap: "993", smtp: "465" };
const PLAIN_PORTS = { imap: "143", smtp: "587" };

const emptyForm = {
  name: "",
  queueId: "",
  address: "",
  password: "",
  imapHost: "",
  imapPort: SECURE_PORTS.imap,
  smtpHost: "",
  smtpPort: SECURE_PORTS.smtp,
  secure: true
};

// Well-known ports decide TLS on their own: IMAP 993 / SMTP 465 are implicit
// TLS, IMAP 143 / SMTP 587 start plain and upgrade with STARTTLS. The
// checkbox only presets the ports; for any other port it is the user's
// choice. IMAP 993 with SMTP 587 (iCloud, Gmail, Outlook) is common, so one
// value for both servers would be wrong.
const PORT_SECURITY = {
  imap: { 993: true, 143: false },
  smtp: { 465: true, 587: false }
};

export const secureForPort = (kind, port, fallback) => {
  const known = PORT_SECURITY[kind]?.[Number(port)];
  return typeof known === "boolean" ? known : Boolean(fallback);
};

const validPort = value => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535;
};

/**
 * Email connection form.
 * - mode "create": new account for `preset` ("gmail" | "icloud" | "custom");
 *   Gmail goes through Google OAuth, the others test + save credentials.
 * - mode "edit": name and queue of `account`.
 * - mode "password": only the (app) password of an iCloud / custom `account`.
 */
const EmailAccountModal = ({
  open,
  onClose,
  onBack,
  onSaved,
  mode = "create",
  preset: presetProp,
  account
}) => {
  const classes = useStyles();
  const theme = useTheme();
  const { findAll: findAllQueues } = useQueues();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [queues, setQueues] = useState([]);
  const [busy, setBusy] = useState(null);

  const preset =
    mode === "create" ? presetProp || "gmail" : account?.preset || "custom";
  const providerKey =
    mode === "create" ? preset : emailProviderKey(account || {});
  const provider = CONNECTION_PROVIDERS[providerKey];
  const providerColor = providerColors(theme, provider).color;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setBusy(null);
    setForm({
      ...emptyForm,
      name: mode === "edit" ? account?.name || "" : "",
      queueId: mode === "edit" && account?.queueId ? account.queueId : ""
    });
  }, [open, mode, presetProp, account]);

  useEffect(() => {
    if (!open || mode === "password") return undefined;
    let active = true;
    findAllQueues()
      .then(data => {
        if (active) setQueues(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        if (active) toastError(err);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const setField = field => event => {
    const value =
      field === "secure" ? event.target.checked : event.target.value;
    setForm(current => {
      const next = { ...current, [field]: value };
      if (field === "secure") {
        const from = value ? PLAIN_PORTS : SECURE_PORTS;
        const to = value ? SECURE_PORTS : PLAIN_PORTS;
        if (current.imapPort === from.imap) next.imapPort = to.imap;
        if (current.smtpPort === from.smtp) next.smtpPort = to.smtp;
      }
      return next;
    });
    setErrors(current => ({ ...current, [field]: undefined }));
  };

  const required = t("form.required");

  const validate = ({ forTest = false } = {}) => {
    const next = {};
    const needsName = mode === "edit" || (mode === "create" && !forTest);
    if (needsName && !form.name.trim()) next.name = required;

    const needsCredentials =
      mode === "password" || (mode === "create" && preset !== "gmail");
    if (needsCredentials && !form.password) next.password = required;

    if (mode === "create" && preset !== "gmail") {
      if (!form.address.trim()) next.address = required;
      else if (!EMAIL_PATTERN.test(form.address.trim()))
        next.address = t("form.invalidEmail");
    }

    if (mode === "create" && preset === "custom") {
      if (!form.imapHost.trim()) next.imapHost = required;
      if (!form.smtpHost.trim()) next.smtpHost = required;
      if (!validPort(form.imapPort)) next.imapPort = t("form.invalidPort");
      if (!validPort(form.smtpPort)) next.smtpPort = t("form.invalidPort");
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const credentialsBody = () => {
    const body = {
      preset,
      address: form.address.trim(),
      password: form.password
    };
    if (preset === "custom") {
      body.imap = {
        host: form.imapHost.trim(),
        port: Number(form.imapPort),
        secure: secureForPort("imap", form.imapPort, form.secure)
      };
      body.smtp = {
        host: form.smtpHost.trim(),
        port: Number(form.smtpPort),
        secure: secureForPort("smtp", form.smtpPort, form.secure)
      };
    }
    return body;
  };

  const run = async (kind, action) => {
    setBusy(kind);
    try {
      await action();
    } catch (err) {
      toastEmailError(err);
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = () => {
    if (!validate()) return;
    run("google", () =>
      startGmailOAuth({ name: form.name.trim(), queueId: form.queueId })
    );
  };

  const handleTest = () => {
    if (!validate({ forTest: true })) return;
    run("test", async () => {
      await api.post("/email/accounts/test", credentialsBody());
      toast.success(t("toasts.testOk"));
    });
  };

  const handleSave = () => {
    if (!validate()) return;
    run("save", async () => {
      let data;
      if (mode === "create") {
        const body = { ...credentialsBody(), name: form.name.trim() };
        if (form.queueId) body.queueId = form.queueId;
        ({ data } = await api.post("/email/accounts", body));
        toast.success(t("toasts.saved"));
      } else if (mode === "edit") {
        ({ data } = await api.put(`/email/accounts/${account.id}`, {
          name: form.name.trim(),
          queueId: form.queueId || null
        }));
        toast.success(t("toasts.updated"));
      } else {
        ({ data } = await api.put(`/email/accounts/${account.id}`, {
          password: form.password
        }));
        toast.success(t("toasts.passwordUpdated"));
      }
      if (onSaved) onSaved(data);
      onClose();
    });
  };

  const header = (() => {
    if (mode === "edit")
      return { title: t("form.edit.title"), subtitle: account?.address || "" };
    if (mode === "password")
      return {
        title:
          providerKey === "icloud"
            ? t("form.password.titleApp")
            : t("form.password.titleMailbox"),
        subtitle: t("form.password.subtitle", {
          address: account?.address || "",
          interpolation: { escapeValue: false }
        })
      };
    return {
      title: t(`form.${preset}.title`),
      subtitle: t(`form.${preset}.subtitle`)
    };
  })();

  const isOauth = mode === "create" && preset === "gmail";
  const showTest = mode === "create" && !isOauth;
  const showSave = !isOauth;
  const isAppPassword = providerKey === "icloud";
  const disabled = Boolean(busy);

  const spinner = kind =>
    busy === kind ? (
      <CircularProgress size={16} className={classes.progress} />
    ) : null;

  const nameAndQueue = (
    <div className={classes.grid2}>
      <TextField
        label={t("form.name")}
        value={form.name}
        onChange={setField("name")}
        placeholder={
          mode === "create" ? t(`form.${preset}.namePlaceholder`) : undefined
        }
        error={Boolean(errors.name)}
        helperText={errors.name || t("form.nameHelp")}
        variant="outlined"
        margin="dense"
        autoFocus
        fullWidth
        InputLabelProps={{ shrink: true }}
        inputProps={{ maxLength: 100 }}
      />
      <TextField
        select
        label={t("form.queue")}
        value={form.queueId}
        onChange={setField("queueId")}
        variant="outlined"
        margin="dense"
        fullWidth
        InputLabelProps={{ shrink: true }}
        SelectProps={{ displayEmpty: true }}
      >
        <MenuItem value="">{t("form.noQueue")}</MenuItem>
        {queues.map(queue => (
          <MenuItem key={queue.id} value={queue.id}>
            {queue.name}
          </MenuItem>
        ))}
      </TextField>
    </div>
  );

  const passwordField = (labelKey, placeholderKey) => (
    <TextField
      id="email-account-password"
      label={t(labelKey)}
      type="password"
      value={form.password}
      onChange={setField("password")}
      placeholder={t(placeholderKey)}
      error={Boolean(errors.password)}
      helperText={errors.password}
      variant="outlined"
      margin="dense"
      fullWidth
      autoComplete="new-password"
      autoFocus={mode === "password"}
      InputLabelProps={{ shrink: true }}
    />
  );

  const appPasswordHelp = (
    <div className={classes.help}>
      <ChannelIcon name="info" size={16} strokeWidth={1.8} />
      <span>{t("form.icloud.help")}</span>
    </div>
  );

  const textField = (field, labelKey, placeholderKey, extra = {}) => (
    <TextField
      id={`email-account-${field}`}
      label={t(labelKey)}
      value={form[field]}
      onChange={setField(field)}
      placeholder={placeholderKey ? t(placeholderKey) : undefined}
      error={Boolean(errors[field])}
      helperText={errors[field]}
      variant="outlined"
      margin="dense"
      fullWidth
      InputLabelProps={{ shrink: true }}
      {...extra}
    />
  );

  return (
    <Dialog
      open={open}
      onClose={disabled ? undefined : onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      aria-labelledby="email-account-title"
    >
      <div className={classes.header}>
        {mode === "create" && onBack && (
          <IconButton
            size="small"
            aria-label={t("form.back")}
            title={t("form.back")}
            onClick={onBack}
            disabled={disabled}
          >
            <ChevronLeft />
          </IconButton>
        )}
        <div className={classes.headerText}>
          <Typography
            id="email-account-title"
            component="h2"
            className={classes.title}
          >
            {header.title}
          </Typography>
          {header.subtitle && (
            <Typography className={classes.subtitle}>
              {header.subtitle}
            </Typography>
          )}
        </div>
        <IconButton
          size="small"
          aria-label={t("form.close")}
          title={t("form.close")}
          onClick={onClose}
          disabled={disabled}
        >
          <Close />
        </IconButton>
      </div>

      <DialogContent className={classes.content}>
        {mode !== "password" && nameAndQueue}

        {isOauth && (
          <div className={classes.oauthBox}>
            <div className={classes.oauthTitle}>{t("form.gmail.howTitle")}</div>
            <ul className={classes.steps}>
              <li>{t("form.gmail.step1")}</li>
              <li>{t("form.gmail.step2")}</li>
              <li>{t("form.gmail.step3")}</li>
            </ul>
            <Button
              variant="outlined"
              className={classes.oauthButton}
              style={{ color: providerColor, borderColor: providerColor }}
              onClick={handleGoogle}
              disabled={disabled}
            >
              <ChannelIcon name={provider.icon} />
              {t("form.gmail.button")}
              {spinner("google")}
            </Button>
          </div>
        )}

        {mode === "create" && preset === "icloud" && (
          <>
            <div className={classes.grid2}>
              {textField(
                "address",
                "form.icloud.address",
                "form.icloud.addressPlaceholder",
                { type: "email", autoComplete: "off" }
              )}
              {passwordField(
                "form.icloud.password",
                "form.icloud.passwordPlaceholder"
              )}
            </div>
            {appPasswordHelp}
          </>
        )}

        {mode === "create" && preset === "custom" && (
          <>
            <div className={classes.grid2}>
              {textField(
                "address",
                "form.custom.address",
                "form.custom.addressPlaceholder",
                { type: "email", autoComplete: "off" }
              )}
              {passwordField(
                "form.custom.password",
                "form.custom.passwordPlaceholder"
              )}
            </div>
            <div className={classes.gridServers}>
              {textField(
                "imapHost",
                "form.custom.imapHost",
                "form.custom.imapHostPlaceholder"
              )}
              {textField("imapPort", "form.custom.port", null, {
                inputProps: { inputMode: "numeric" }
              })}
              {textField(
                "smtpHost",
                "form.custom.smtpHost",
                "form.custom.smtpHostPlaceholder"
              )}
              {textField("smtpPort", "form.custom.port", null, {
                inputProps: { inputMode: "numeric" }
              })}
            </div>
            <FormControlLabel
              control={
                <Checkbox
                  color="primary"
                  checked={form.secure}
                  onChange={setField("secure")}
                />
              }
              label={t("form.custom.secure")}
            />
          </>
        )}

        {mode === "password" && (
          <>
            {isAppPassword
              ? passwordField(
                  "form.icloud.password",
                  "form.icloud.passwordPlaceholder"
                )
              : passwordField(
                  "form.custom.password",
                  "form.custom.passwordPlaceholder"
                )}
            {isAppPassword && appPasswordHelp}
          </>
        )}
      </DialogContent>

      <DialogActions className={classes.footer}>
        <span className={classes.footerNote}>
          {mode === "create" ? t("form.footer") : ""}
        </span>
        <Button variant="outlined" onClick={onClose} disabled={disabled}>
          {t("form.cancel")}
        </Button>
        {showTest && (
          <Button
            variant="outlined"
            color="primary"
            onClick={handleTest}
            disabled={disabled}
          >
            {t("form.test")}
            {spinner("test")}
          </Button>
        )}
        {showSave && (
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={disabled}
          >
            {mode === "create"
              ? t("form.save")
              : mode === "edit"
                ? t("form.edit.save")
                : t("form.password.save")}
            {spinner("save")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default EmailAccountModal;
