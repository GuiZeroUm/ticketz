import { AuthContext } from "../../context/Auth/AuthContext";
import StardewEmblem from "../../components/StardewEmblem";
import React, {
  useState,
  useCallback,
  useContext,
  useEffect,
  useRef
} from "react";
import { toast } from "react-toastify";
import { format, parseISO } from "date-fns";

import { alpha, makeStyles, useTheme } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import {
  Button,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Table,
  TableHead,
  Paper,
  Tooltip,
  Typography,
  CircularProgress,
  Checkbox,
  Chip,
  InputBase
} from "@material-ui/core";
import {
  Edit,
  CheckCircle,
  SignalCellularConnectedNoInternet2Bar,
  SignalCellularConnectedNoInternet0Bar,
  SignalCellular4Bar,
  CropFree,
  DeleteOutline,
  Lock,
  Refresh,
  Replay,
  SettingsBackupRestore
} from "@material-ui/icons";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPhoneSlash,
  faQrcode,
  faUserLock,
  faWandMagicSparkles
} from "@fortawesome/free-solid-svg-icons";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import TableRowSkeleton from "../../components/TableRowSkeleton";

import api from "../../services/api";
import WhatsAppModal from "../../components/WhatsAppModal";
import ConfirmationModal from "../../components/ConfirmationModal";
import QrcodeModal from "../../components/QrcodeModal";
import PasskeyModal from "../../components/PasskeyModal";
import PrivacyModal from "../../components/PrivacyModal";
import { i18n } from "../../translate/i18n";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import toastError from "../../errors/toastError";
import wavoipIcon from "../../assets/wavoip.webp";
import WavoipModal from "../../components/WavoipModal";
import { wavoipAvailable } from "../../helpers/wavoipCallManager";
import MetaOnboardingStatus from "../../components/MetaOnboardingStatus";
import { formatWhatsappDigits } from "../../helpers/formatWhatsappDisplay";
import useEmailAvailability from "../../hooks/useEmailAvailability";
import useEmailAccounts from "../../hooks/useEmailAccounts";
import AddConnectionModal from "../../components/AddConnectionModal";
import EmailAccountModal from "../../components/EmailAccountModal";
import {
  CONNECTION_PROVIDERS,
  ChannelIcon,
  emailProviderKey,
  finishGmailOAuth,
  providerColors,
  startGmailOAuth,
  toastEmailError,
  translateEmailError
} from "../../helpers/emailConnections";
import { consumeEmailOAuthReturn } from "../../helpers/emailOAuthReturn";

const te = (key, options) => i18n.t(`emailChannel.connections.${key}`, options);

// "1 conectada" / "2 conectadas": explicit one/other keys so every language
// bundle (including pt_PT) picks the right form.
const countText = (key, count) =>
  te(`${key}.${count === 1 ? "one" : "other"}`, { count });

const WHATSAPP_WAITING = ["qrcode", "OPENING", "PAIRING", "passkey_required"];
const WHATSAPP_DOWN = ["DISCONNECTED", "TIMEOUT"];
const EMAIL_ATTENTION = ["reauth_required", "error", "disabled"];

const matchesSearch = (term, ...values) =>
  !term ||
  values.some(value =>
    String(value || "")
      .toLowerCase()
      .includes(term)
  );

const formatEmailDate = value => {
  if (!value) return "—";
  try {
    return format(
      typeof value === "string" ? parseISO(value) : new Date(value),
      "dd/MM/yy HH:mm"
    );
  } catch (_) {
    return "—";
  }
};

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles
  },
  customTableCell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  tooltip: {
    backgroundColor: theme.isStardew ? theme.stardew.paper : "#f5f5f9",
    color: theme.isStardew ? theme.stardew.ink : "rgba(0, 0, 0, 0.87)",
    fontSize: theme.isStardew ? 19 : theme.typography.pxToRem(14),
    border: theme.isStardew
      ? `2px solid ${theme.stardew.border}`
      : "1px solid #dadde9",
    maxWidth: 450
  },
  tooltipPopper: {
    textAlign: "center"
  },
  buttonProgress: {
    color: theme.isStardew ? theme.stardew.green : green[500]
  },
  summary: {
    flex: "none",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 12
  },
  summaryCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 12
  },
  summaryIcon: {
    width: 40,
    height: 40,
    flex: "none",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  summaryText: {
    flex: 1,
    minWidth: 0
  },
  summaryLabel: {
    fontWeight: 600,
    fontSize: theme.isStardew ? 18 : 14
  },
  summaryDetail: {
    marginTop: 2,
    color: theme.palette.text.secondary,
    fontSize: theme.isStardew ? 15 : 12
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: theme.spacing(0.5, 0.5, 1.5)
  },
  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6
  },
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 34,
    minWidth: 240,
    padding: "0 10px",
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8,
    color: theme.palette.text.secondary,
    [theme.breakpoints.down("xs")]: {
      minWidth: 0,
      width: "100%"
    }
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.isStardew ? 17 : 13
  },
  filterChip: {
    borderRadius: 8,
    fontWeight: 500
  },
  filterChipSelected: {
    fontWeight: 600,
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
    "&:hover, &:focus": {
      backgroundColor: `${alpha(theme.palette.primary.main, 0.14)} !important`
    }
  },
  filterChipIcon: {
    marginLeft: 8
  },
  filterCount: {
    marginLeft: 6,
    fontSize: "0.85em",
    fontWeight: 600,
    opacity: 0.8
  },
  channelChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 26,
    padding: "0 9px",
    borderRadius: 7,
    fontSize: theme.isStardew ? 15 : 12,
    fontWeight: 600,
    whiteSpace: "nowrap"
  },
  rowNote: {
    color: theme.palette.text.secondary,
    fontSize: theme.isStardew ? 15 : 12,
    marginTop: 2
  },
  emailStatus: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: theme.isStardew ? 15 : 12,
    fontWeight: 600,
    whiteSpace: "nowrap"
  }
}));

const ChannelChip = ({ providerKey }) => {
  const classes = useStyles();
  const theme = useTheme();
  const provider = CONNECTION_PROVIDERS[providerKey];
  const { color, tint } = providerColors(theme, provider);
  return (
    <span className={classes.channelChip} style={{ background: tint, color }}>
      <ChannelIcon name={provider.icon} size={14} strokeWidth={2} />
      {te(`providers.${provider.labelKey}`)}
    </span>
  );
};

const CustomToolTip = ({ title, content, children }) => {
  const classes = useStyles();

  return (
    <Tooltip
      arrow
      classes={{
        tooltip: classes.tooltip,
        popper: classes.tooltipPopper
      }}
      title={
        <React.Fragment>
          <Typography gutterBottom color="inherit">
            {title}
          </Typography>
          {content && <Typography>{content}</Typography>}
        </React.Fragment>
      }
    >
      {children}
    </Tooltip>
  );
};

const Connections = () => {
  const { user } = useContext(AuthContext);
  const classes = useStyles();
  const theme = useTheme();

  const { whatsApps, loading } = useContext(WhatsAppsContext);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedWhatsApp, setSelectedWhatsApp] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const confirmationModalInitialState = {
    action: "",
    title: "",
    message: "",
    whatsAppId: "",
    open: false
  };
  const [confirmModalInfo, setConfirmModalInfo] = useState(
    confirmationModalInitialState
  );
  const [wavoipModalOpen, setWavoipModalOpen] = useState(false);
  const [passkeyModalOpen, setPasskeyModalOpen] = useState(false);
  const [passkeyInitialToken, setPasskeyInitialToken] = useState("");
  const [connectorReady, setConnectorReady] = useState(false);
  const [metaConfig, setMetaConfig] = useState({
    appId: null,
    configId: null,
    signupAvailable: false,
    loading: true
  });
  const [metaConfigRefresh, setMetaConfigRefresh] = useState(0);
  const refreshMetaConfig = useCallback(
    () => setMetaConfigRefresh(value => value + 1),
    []
  );

  // Email channel: everything below is inert while the company has the
  // channel disabled, so the page stays exactly as it was.
  const { enabled: emailEnabled, loading: emailAvailabilityLoading } =
    useEmailAvailability();
  const {
    accounts: emailAccounts,
    loading: emailLoading,
    reload: reloadEmailAccounts,
    upsert: upsertEmailAccount
  } = useEmailAccounts(emailEnabled);
  // Latest list actions for the Gmail OAuth finish below, which outlives the
  // render that started it.
  const emailAccountActionsRef = useRef({});
  emailAccountActionsRef.current = {
    upsert: upsertEmailAccount,
    reload: reloadEmailAccounts
  };
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );
  const [channelFilter, setChannelFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [addConnectionOpen, setAddConnectionOpen] = useState(false);
  const [emailModal, setEmailModal] = useState({
    open: false,
    mode: "create",
    preset: null,
    account: null
  });

  // Google OAuth comes back to /connections#email=pending&handle=... (or
  // #email=error&code=...; older backends used the query string).
  // src/index.js takes that result off the URL before
  // the app renders (the query does not survive the auth redirects); once
  // availability is known it is consumed here, exactly once: a pending
  // handle is finished with POST /email/oauth/google/finish (ruling R27).
  useEffect(() => {
    if (emailAvailabilityLoading) return;
    const oauthReturn = consumeEmailOAuthReturn();
    if (!oauthReturn) return;
    if (oauthReturn.result === "error") {
      toastEmailError(oauthReturn.code || "generic");
      return;
    }
    if (oauthReturn.result === "connected") {
      // older backends finished the connection in the callback itself
      toast.success(te("toasts.gmailConnected"));
      return;
    }
    finishGmailOAuth(oauthReturn.handle)
      .then(account => {
        toast.success(te("toasts.gmailConnected"));
        if (!mountedRef.current) return;
        emailAccountActionsRef.current.upsert(account);
        emailAccountActionsRef.current.reload();
      })
      .catch(err => toastEmailError(err));
  }, [emailAvailabilityLoading]);

  useEffect(() => {
    setMetaConfig({
      appId: null,
      configId: null,
      signupAvailable: false,
      loading: true
    });
    if (user?.company?.whatsappMode !== "meta") return undefined;
    let active = true;
    const controller = new AbortController();
    api
      .get("/whatsapp/meta/config", {
        signal: controller.signal,
        timeout: 15000
      })
      .then(({ data }) => {
        if (active) setMetaConfig({ ...data, loading: false, failed: false });
      })
      .catch(() => {
        if (active)
          setMetaConfig({
            appId: null,
            configId: null,
            signupAvailable: false,
            loading: false,
            failed: true
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [user?.companyId, user?.company?.whatsappMode, metaConfigRefresh]);

  const handleStartWhatsAppSession = async whatsAppId => {
    try {
      await api.post(`/whatsappsession/${whatsAppId}`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleRequestNewQrCode = async whatsAppId => {
    try {
      await api.put(`/whatsappsession/${whatsAppId}`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleOpenWhatsAppModal = () => {
    setSelectedWhatsApp(null);
    setWhatsAppModalOpen(true);
  };

  const handleCloseWhatsAppModal = useCallback(() => {
    setWhatsAppModalOpen(false);
    setSelectedWhatsApp(null);
  }, [setSelectedWhatsApp, setWhatsAppModalOpen]);

  const handleOpenQrModal = whatsApp => {
    setSelectedWhatsApp(whatsApp);
    setQrModalOpen(true);
  };

  const handleCloseQrModal = useCallback(() => {
    setSelectedWhatsApp(null);
    setQrModalOpen(false);
  }, [setQrModalOpen, setSelectedWhatsApp]);

  const handleOpenPasskeyModal = whatsApp => {
    setSelectedWhatsApp(whatsApp);
    setPasskeyModalOpen(true);
  };

  const handleResetPasskeySession = async whatsAppId => {
    try {
      await api.post(`/whatsappsession/${whatsAppId}/reset`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleClosePasskeyModal = useCallback(() => {
    setSelectedWhatsApp(null);
    setPasskeyInitialToken("");
    setPasskeyModalOpen(false);
  }, [setPasskeyModalOpen, setSelectedWhatsApp, setPasskeyInitialToken]);

  const handleTriggerCaptureFromQr = useCallback(
    token => {
      setQrModalOpen(false);
      setPasskeyInitialToken(token);
      setPasskeyModalOpen(true);
    },
    [setQrModalOpen, setPasskeyInitialToken, setPasskeyModalOpen]
  );

  const handleOpenInstallInstructionsFromQr = useCallback(() => {
    setQrModalOpen(false);
    setPasskeyInitialToken("");
    setPasskeyModalOpen(true);
  }, [setQrModalOpen, setPasskeyInitialToken, setPasskeyModalOpen]);

  const handleEditWhatsApp = whatsApp => {
    setSelectedWhatsApp(whatsApp);
    setWhatsAppModalOpen(true);
  };

  const handleOpenPrivacyWhatsApp = whatsApp => {
    setSelectedWhatsApp(whatsApp);
    setPrivacyModalOpen(true);
  };

  const handleClosePrivacyWhatsAppModal = useCallback(() => {
    setSelectedWhatsApp(null);
    setPrivacyModalOpen(false);
  }, [setPrivacyModalOpen, setSelectedWhatsApp]);

  const handleOpenConfirmationModal = (action, whatsAppId) => {
    if (action === "disconnect") {
      setConfirmModalInfo({
        action: action,
        title: i18n.t("connections.confirmationModal.disconnectTitle"),
        message: i18n.t("connections.confirmationModal.disconnectMessage"),
        whatsAppId: whatsAppId
      });
    }

    if (action === "delete") {
      setConfirmModalInfo({
        action: action,
        title: i18n.t("connections.confirmationModal.deleteTitle"),
        message: i18n.t("connections.confirmationModal.deleteMessage"),
        whatsAppId: whatsAppId
      });
    }
    setConfirmModalOpen(true);
  };

  const handleSubmitConfirmationModal = async checked => {
    if (confirmModalInfo.action === "disconnect") {
      try {
        await api.delete(`/whatsappsession/${confirmModalInfo.whatsAppId}`);
      } catch (err) {
        toastError(err);
      }
    }

    if (confirmModalInfo.action === "delete") {
      try {
        await api.delete(`/whatsapp/${confirmModalInfo.whatsAppId}`, {
          params: { closeTickets: checked }
        });
        toast.success(i18n.t("connections.toasts.deleted"));
      } catch (err) {
        toastError(err);
      }
    }

    if (confirmModalInfo.action === "emailDisconnect") {
      try {
        await api.delete(`/email/accounts/${confirmModalInfo.emailAccountId}`);
        toast.success(te("toasts.disconnected"));
        reloadEmailAccounts();
      } catch (err) {
        toastEmailError(err);
      }
    }

    setConfirmModalInfo(confirmationModalInitialState);
  };

  // Add a handler to open the WavoipModal
  const handleOpenWavoipModal = whatsApp => {
    setSelectedWhatsApp(whatsApp);
    setWavoipModalOpen(true);
  };

  const handleCloseWavoipModal = useCallback(() => {
    setWavoipModalOpen(false);
    setSelectedWhatsApp(null);
  }, [setWavoipModalOpen, setSelectedWhatsApp]);

  const refreshWhatsApp = async whatsApp => {
    try {
      await api.get(`/whatsappsession/refresh/${whatsApp.id}`);
    } catch (err) {
      toastError(err);
    }
  };

  const openEmailModal = (mode, account = null, preset = null) => {
    setEmailModal({ open: true, mode, account, preset });
  };

  const handleCloseEmailModal = useCallback(() => {
    setEmailModal(current => ({ ...current, open: false }));
  }, []);

  const handlePickWhatsApp = () => {
    setAddConnectionOpen(false);
    handleOpenWhatsAppModal();
  };

  const handlePickEmail = preset => {
    setAddConnectionOpen(false);
    openEmailModal("create", null, preset);
  };

  const handleBackToPicker = () => {
    handleCloseEmailModal();
    setAddConnectionOpen(true);
  };

  const handleSyncEmailAccount = async account => {
    try {
      await api.post(`/email/accounts/${account.id}/sync`);
      toast.success(te("toasts.syncQueued"));
    } catch (err) {
      toastEmailError(err);
    }
  };

  const handleEmailReauth = async account => {
    if (emailProviderKey(account) !== "gmail") {
      openEmailModal("password", account);
      return;
    }
    try {
      await startGmailOAuth({
        name: account.name,
        queueId: account.queueId,
        // only Gmail API accounts can be reconnected in place
        accountId: account.provider === "gmail_api" ? account.id : undefined
      });
    } catch (err) {
      toastEmailError(err);
    }
  };

  const handleOpenEmailDisconnect = account => {
    setConfirmModalInfo({
      action: "emailDisconnect",
      title: te("confirm.disconnectTitle"),
      message: te("confirm.disconnectMessage"),
      emailAccountId: account.id
    });
    setConfirmModalOpen(true);
  };

  // Status labels, colors and icons follow the design board's status map.
  const emailStatusInfo = account => {
    const isGmail = emailProviderKey(account) === "gmail";
    switch (account.status) {
      case "active":
        return {
          key: "active",
          color: theme.isStardew ? theme.stardew.green : "#16A34A",
          icon: "on"
        };
      case "connecting":
        return {
          key: "connecting",
          color: theme.palette.text.secondary,
          icon: "clock"
        };
      case "reauth_required":
        return {
          key: isGmail ? "authExpired" : "invalidPassword",
          color: "#B45309",
          icon: "warn"
        };
      case "disabled":
        return { key: "disabled", color: "#DC2626", icon: "off" };
      default:
        return { key: "error", color: "#DC2626", icon: "error" };
    }
  };

  const renderEmailStatus = account => {
    const { key, color, icon } = emailStatusInfo(account);
    const description =
      (key === "error" && translateEmailError(account.lastError?.code)) ||
      te(`status.${key}.title`);
    return (
      <div className={classes.customTableCell}>
        <CustomToolTip title={te(`status.${key}.label`)} content={description}>
          <span className={classes.emailStatus} style={{ color }}>
            <ChannelIcon name={icon} strokeWidth={1.8} />
            {te(`status.${key}.label`)}
          </span>
        </CustomToolTip>
      </div>
    );
  };

  const renderEmailSessionButtons = account => {
    const isGmail = emailProviderKey(account) === "gmail";
    const { status } = account;
    const needsReauth = ["reauth_required", "error", "disabled"].includes(
      status
    );
    const canSync = ["active", "connecting", "error"].includes(status);
    const reauthLabel = isGmail
      ? te("actions.reconnectGmail")
      : account.preset === "icloud"
        ? te("actions.updateAppPassword")
        : te("actions.updatePassword");

    return (
      <>
        {needsReauth && (
          <Tooltip title={reauthLabel}>
            <IconButton
              size="small"
              color="primary"
              aria-label={reauthLabel}
              onClick={() => handleEmailReauth(account)}
            >
              <ChannelIcon name="key" strokeWidth={1.7} />
            </IconButton>
          </Tooltip>
        )}
        {status !== "disabled" && (
          <Tooltip title={te("actions.disconnect")}>
            <IconButton
              size="small"
              aria-label={te("actions.disconnect")}
              onClick={() => handleOpenEmailDisconnect(account)}
            >
              <ChannelIcon name="unplug" strokeWidth={1.7} />
            </IconButton>
          </Tooltip>
        )}
        {canSync && (
          <Tooltip title={te("actions.syncNow")}>
            <IconButton
              size="small"
              aria-label={te("actions.syncNow")}
              onClick={() => handleSyncEmailAccount(account)}
            >
              <ChannelIcon name="retry" strokeWidth={1.7} />
            </IconButton>
          </Tooltip>
        )}
      </>
    );
  };

  const renderActionButtons = whatsApp => {
    const isOfficial = whatsApp.apiMode === "official";

    if (isOfficial) {
      return (
        <>
          <MetaOnboardingStatus
            key={`${user?.companyId}-${whatsApp.id}`}
            whatsapp={whatsApp}
            config={metaConfig}
            onRefreshConfig={refreshMetaConfig}
            companyId={user?.companyId}
          />
          {(whatsApp.status === "CONNECTED" ||
            whatsApp.status === "PAIRING" ||
            whatsApp.status === "TIMEOUT") && (
            <Tooltip title={i18n.t("connections.toolTips.disconnect")}>
              <IconButton
                size="small"
                onClick={() => {
                  handleOpenConfirmationModal("disconnect", whatsApp.id);
                }}
              >
                <FontAwesomeIcon icon={faPhoneSlash} />
              </IconButton>
            </Tooltip>
          )}
        </>
      );
    }

    return (
      <>
        {whatsApp.status === "qrcode" && (
          <Tooltip title={i18n.t("connections.toolTips.scan")}>
            <IconButton
              size="small"
              onClick={() => handleOpenQrModal(whatsApp)}
            >
              <FontAwesomeIcon icon={faQrcode} />
            </IconButton>
          </Tooltip>
        )}
        {whatsApp.status === "passkey_required" && (
          <>
            <Tooltip title={i18n.t("connections.toolTips.passkey.title")}>
              <IconButton
                size="small"
                onClick={() => handleOpenPasskeyModal(whatsApp)}
              >
                <FontAwesomeIcon icon={faUserLock} />
              </IconButton>
            </Tooltip>
            <Tooltip title={i18n.t("connections.toolTips.resetPasskey")}>
              <IconButton
                size="small"
                onClick={() => handleResetPasskeySession(whatsApp.id)}
              >
                <SettingsBackupRestore />
              </IconButton>
            </Tooltip>
          </>
        )}
        {whatsApp.status === "DISCONNECTED" && (
          <>
            <Tooltip title={i18n.t("connections.toolTips.retry")}>
              <IconButton
                size="small"
                onClick={() => handleStartWhatsAppSession(whatsApp.id)}
              >
                <Replay />
              </IconButton>
            </Tooltip>

            <Tooltip title={i18n.t("connections.toolTips.newQr")}>
              <IconButton
                size="small"
                onClick={() => handleRequestNewQrCode(whatsApp.id)}
              >
                <FontAwesomeIcon icon={faWandMagicSparkles} />
              </IconButton>
            </Tooltip>
          </>
        )}
        {(whatsApp.status === "CONNECTED" ||
          whatsApp.status === "PAIRING" ||
          whatsApp.status === "TIMEOUT") && (
          <Tooltip title={i18n.t("connections.toolTips.disconnect")}>
            <IconButton
              size="small"
              onClick={() => {
                handleOpenConfirmationModal("disconnect", whatsApp.id);
              }}
            >
              <FontAwesomeIcon icon={faPhoneSlash} />
            </IconButton>
          </Tooltip>
        )}
        {whatsApp.status === "CONNECTED" && whatsApp.channel === "whatsapp" && (
          <Tooltip title={i18n.t("connections.toolTips.refresh")}>
            <IconButton size="small" onClick={() => refreshWhatsApp(whatsApp)}>
              <Refresh />
            </IconButton>
          </Tooltip>
        )}
      </>
    );
  };

  const renderStatusToolTips = whatsApp => {
    return (
      <div className={classes.customTableCell}>
        {whatsApp.status === "DISCONNECTED" && (
          <CustomToolTip
            title={i18n.t("connections.toolTips.disconnected.title")}
            content={i18n.t("connections.toolTips.disconnected.content")}
          >
            <SignalCellularConnectedNoInternet0Bar color="secondary" />
          </CustomToolTip>
        )}
        {whatsApp.status === "OPENING" && (
          <CircularProgress size={24} className={classes.buttonProgress} />
        )}
        {whatsApp.status === "qrcode" && (
          <CustomToolTip
            title={i18n.t("connections.toolTips.qrcode.title")}
            content={i18n.t("connections.toolTips.qrcode.content")}
          >
            <CropFree />
          </CustomToolTip>
        )}
        {whatsApp.status === "passkey_required" && (
          <CustomToolTip
            title={i18n.t("connections.toolTips.passkey.title")}
            content={i18n.t("connections.toolTips.passkey.content")}
          >
            <FontAwesomeIcon icon={faUserLock} color="primary" />
          </CustomToolTip>
        )}
        {whatsApp.status === "CONNECTED" && (
          <CustomToolTip title={i18n.t("connections.toolTips.connected.title")}>
            <SignalCellular4Bar
              style={{
                color: theme.isStardew ? theme.stardew.green : green[500]
              }}
            />
          </CustomToolTip>
        )}
        {(whatsApp.status === "TIMEOUT" || whatsApp.status === "PAIRING") && (
          <CustomToolTip
            title={i18n.t("connections.toolTips.timeout.title")}
            content={i18n.t("connections.toolTips.timeout.content")}
          >
            <SignalCellularConnectedNoInternet2Bar color="secondary" />
          </CustomToolTip>
        )}
      </div>
    );
  };

  const showWhatsAppRows = !emailEnabled || channelFilter !== "email";
  const showEmailRows = emailEnabled && channelFilter !== "whatsapp";
  const tableColumns = emailEnabled ? 8 : 7;
  // While availability is unknown keep the skeleton, so email companies do
  // not see the old layout flash first.
  const tableLoading =
    loading || emailAvailabilityLoading || (showEmailRows && emailLoading);

  // Search only exists with the email channel on (design); off, it is inert.
  const search = emailEnabled ? searchTerm.trim().toLowerCase() : "";
  const visibleWhatsApps = (whatsApps || []).filter(whatsApp =>
    matchesSearch(
      search,
      whatsApp.name,
      whatsApp.number,
      formatWhatsappDigits(whatsApp.number)
    )
  );
  const visibleEmailAccounts = emailAccounts.filter(account =>
    matchesSearch(search, account.name, account.address)
  );

  const whatsAppSummary = (() => {
    if (loading) return "…";
    const list = whatsApps || [];
    if (!list.length) return te("summary.whatsapp.empty");
    const connected = list.filter(w => w.status === "CONNECTED").length;
    const waiting = list.filter(w =>
      WHATSAPP_WAITING.includes(w.status)
    ).length;
    const down = list.filter(w => WHATSAPP_DOWN.includes(w.status)).length;
    const parts = [];
    if (connected)
      parts.push(countText("summary.whatsapp.connected", connected));
    if (waiting) parts.push(countText("summary.whatsapp.waiting", waiting));
    if (down) parts.push(countText("summary.whatsapp.disconnected", down));
    if (!parts.length)
      parts.push(countText("summary.whatsapp.total", list.length));
    return parts.join(" · ");
  })();

  const emailSummary = (() => {
    if (emailLoading) return "…";
    if (!emailAccounts.length) return te("summary.email.empty");
    const attention = emailAccounts.filter(account =>
      EMAIL_ATTENTION.includes(account.status)
    ).length;
    const parts = [countText("summary.email.accounts", emailAccounts.length)];
    if (attention) parts.push(countText("summary.email.attention", attention));
    return parts.join(" · ");
  })();

  const summaryCards = [
    {
      key: "whatsapp",
      icon: "wa",
      colors: providerColors(theme, "wa"),
      detail: whatsAppSummary
    },
    {
      key: "email",
      icon: "mail",
      colors: providerColors(theme, {
        color: theme.palette.type === "dark" ? "#A1A1AA" : "#3F3F46",
        tint: "#F1F1F3"
      }),
      detail: emailSummary
    }
  ];

  const channelFilters = [
    {
      key: "all",
      icon: "all",
      color: theme.palette.text.secondary,
      count: (whatsApps?.length || 0) + emailAccounts.length
    },
    {
      key: "whatsapp",
      icon: "wa",
      color: providerColors(theme, "wa").color,
      count: whatsApps?.length || 0
    },
    {
      key: "email",
      icon: "mail",
      color: theme.palette.text.secondary,
      count: emailAccounts.length
    }
  ];

  return (
    <MainContainer className="sv-operations sv-screen-connections">
      <ConfirmationModal
        title={confirmModalInfo.title}
        open={confirmModalOpen}
        onClose={setConfirmModalOpen}
        onConfirm={handleSubmitConfirmationModal}
        checkbox={
          confirmModalInfo.action === "delete"
            ? i18n.t("connections.confirmationModal.closeTickets")
            : undefined
        }
      >
        {confirmModalInfo.message}
      </ConfirmationModal>
      <QrcodeModal
        open={qrModalOpen}
        onClose={handleCloseQrModal}
        onOpenPasskeyModal={handleOpenInstallInstructionsFromQr}
        connectorReady={connectorReady}
        whatsAppId={
          !whatsAppModalOpen && !privacyModalOpen && selectedWhatsApp?.id
        }
      />
      <PasskeyModal
        open={passkeyModalOpen}
        onClose={handleClosePasskeyModal}
        captureToken={passkeyInitialToken}
        onConnectorReady={() => setConnectorReady(true)}
        whatsAppId={
          !whatsAppModalOpen && !privacyModalOpen && selectedWhatsApp?.id
        }
      />
      <WhatsAppModal
        open={whatsAppModalOpen}
        onClose={handleCloseWhatsAppModal}
        whatsAppId={!qrModalOpen && !privacyModalOpen && selectedWhatsApp?.id}
      />
      <PrivacyModal
        open={privacyModalOpen}
        onClose={handleClosePrivacyWhatsAppModal}
        whatsAppId={!qrModalOpen && !whatsAppModalOpen && selectedWhatsApp?.id}
      />
      <WavoipModal
        open={wavoipModalOpen}
        onClose={handleCloseWavoipModal}
        whatsappId={selectedWhatsApp?.id}
      />
      {emailEnabled && (
        <>
          <AddConnectionModal
            open={addConnectionOpen}
            onClose={() => setAddConnectionOpen(false)}
            whatsappMode={user?.company?.whatsappMode}
            onPickWhatsApp={handlePickWhatsApp}
            onPickEmail={handlePickEmail}
          />
          <EmailAccountModal
            open={emailModal.open}
            mode={emailModal.mode}
            preset={emailModal.preset}
            account={emailModal.account}
            onClose={handleCloseEmailModal}
            onBack={handleBackToPicker}
            onSaved={reloadEmailAccounts}
          />
        </>
      )}
      <MainHeader>
        <StardewEmblem item="lamp" />
        <Title>{i18n.t("connections.title")}</Title>
        <MainHeaderButtonsWrapper>
          {emailEnabled ? (
            <Button
              variant="contained"
              color="primary"
              onClick={() => setAddConnectionOpen(true)}
            >
              {te("actions.add")}
            </Button>
          ) : (
            <Button
              variant="contained"
              color="primary"
              onClick={handleOpenWhatsAppModal}
              disabled={emailAvailabilityLoading}
            >
              {i18n.t("connections.buttons.add")}
            </Button>
          )}
        </MainHeaderButtonsWrapper>
      </MainHeader>
      {emailEnabled && (
        <div className={classes.summary}>
          {summaryCards.map(card => (
            <Paper
              key={card.key}
              variant="outlined"
              className={classes.summaryCard}
            >
              <span
                className={classes.summaryIcon}
                style={{
                  background: card.colors.tint,
                  color: card.colors.color
                }}
              >
                <ChannelIcon name={card.icon} size={20} />
              </span>
              <div className={classes.summaryText}>
                <div className={classes.summaryLabel}>
                  {te(`summary.${card.key}.label`)}
                </div>
                <div className={classes.summaryDetail}>{card.detail}</div>
              </div>
            </Paper>
          ))}
        </div>
      )}
      <Paper className={classes.mainPaper} variant="outlined">
        {emailEnabled && (
          <div className={classes.toolbar}>
            <div
              className={classes.filterBar}
              role="group"
              aria-label={te("filters.label")}
            >
              {channelFilters.map(filter => {
                const selected = channelFilter === filter.key;
                return (
                  <Chip
                    key={filter.key}
                    clickable
                    variant="outlined"
                    color={selected ? "primary" : "default"}
                    aria-pressed={selected}
                    className={`${classes.filterChip} ${
                      selected ? classes.filterChipSelected : ""
                    }`}
                    onClick={() => setChannelFilter(filter.key)}
                    icon={
                      <ChannelIcon
                        name={filter.icon}
                        size={14}
                        className={classes.filterChipIcon}
                        style={{
                          color: selected
                            ? theme.palette.primary.main
                            : filter.color
                        }}
                      />
                    }
                    label={
                      <>
                        {te(`filters.${filter.key}`)}
                        <span className={classes.filterCount}>
                          {filter.count}
                        </span>
                      </>
                    }
                  />
                );
              })}
            </div>
            <label className={classes.search}>
              <ChannelIcon name="search" size={16} strokeWidth={1.8} />
              <InputBase
                type="search"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder={te("search.placeholder")}
                className={classes.searchInput}
                inputProps={{ "aria-label": te("search.placeholder") }}
              />
            </label>
          </div>
        )}
        <Table size="small">
          <TableHead>
            <TableRow>
              {emailEnabled ? (
                <>
                  <TableCell align="center">{te("table.channel")}</TableCell>
                  <TableCell align="center">
                    {i18n.t("connections.table.name")}
                  </TableCell>
                  <TableCell align="center">{te("table.account")}</TableCell>
                </>
              ) : (
                <>
                  <TableCell align="center">
                    {i18n.t("connections.table.contact")}
                  </TableCell>
                  <TableCell align="center">
                    {i18n.t("connections.table.name")}
                  </TableCell>
                </>
              )}
              <TableCell align="center">
                {i18n.t("connections.table.status")}
              </TableCell>
              <TableCell align="center">
                {i18n.t("connections.table.session")}
              </TableCell>
              <TableCell align="center">
                {i18n.t("connections.table.lastUpdate")}
              </TableCell>
              <TableCell align="center">
                {emailEnabled
                  ? te("table.default")
                  : i18n.t("connections.table.default")}
              </TableCell>
              <TableCell align="center">
                {i18n.t("connections.table.actions")}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tableLoading ? (
              <TableRowSkeleton columns={tableColumns} />
            ) : (
              <>
                {showWhatsAppRows &&
                  visibleWhatsApps.length > 0 &&
                  visibleWhatsApps.map(whatsApp => (
                    <TableRow key={whatsApp.id}>
                      {emailEnabled ? (
                        <>
                          <TableCell align="center">
                            <ChannelChip
                              providerKey={
                                whatsApp.apiMode === "official" ? "waapi" : "wa"
                              }
                            />
                          </TableCell>
                          <TableCell align="center">
                            <div>{whatsApp.name}</div>
                            {whatsApp.apiMode === "official" && (
                              <div className={classes.rowNote}>
                                {te("note.metaCloudApi")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {formatWhatsappDigits(whatsApp.number) || "—"}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell align="center">
                            {formatWhatsappDigits(whatsApp.number) || "—"}
                          </TableCell>
                          <TableCell align="center">{whatsApp.name}</TableCell>
                        </>
                      )}
                      <TableCell align="center">
                        {renderStatusToolTips(whatsApp)}
                      </TableCell>
                      <TableCell align="center">
                        {renderActionButtons(whatsApp)}
                      </TableCell>
                      <TableCell align="center">
                        {format(parseISO(whatsApp.updatedAt), "dd/MM/yy HH:mm")}
                      </TableCell>
                      <TableCell align="center">
                        {whatsApp.isDefault && (
                          <div className={classes.customTableCell}>
                            <CheckCircle
                              style={{
                                color: theme.isStardew
                                  ? theme.stardew.green
                                  : green[500]
                              }}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => handleEditWhatsApp(whatsApp)}
                        >
                          <Edit />
                        </IconButton>

                        {whatsApp.status === "CONNECTED" && (
                          <Tooltip
                            title={
                              whatsApp.apiMode === "official"
                                ? i18n.t(
                                    "connections.toolTips.notAvailableOfficial"
                                  )
                                : ""
                            }
                          >
                            <span>
                              <IconButton
                                size="small"
                                disabled={whatsApp.apiMode === "official"}
                                onClick={() =>
                                  handleOpenPrivacyWhatsApp(whatsApp)
                                }
                              >
                                <Lock />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}

                        {false &&
                          whatsApp.channel === "whatsapp" &&
                          wavoipAvailable() && (
                            <IconButton
                              size="small"
                              onClick={() => handleOpenWavoipModal(whatsApp)}
                            >
                              <img
                                src={wavoipIcon}
                                alt="Wavoip"
                                style={{ width: 20, height: 20 }}
                              />
                            </IconButton>
                          )}

                        <IconButton
                          size="small"
                          onClick={e => {
                            handleOpenConfirmationModal("delete", whatsApp.id);
                          }}
                        >
                          <DeleteOutline />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                {showEmailRows &&
                  visibleEmailAccounts.map(account => (
                    <TableRow key={`email-${account.id}`}>
                      <TableCell align="center">
                        <ChannelChip providerKey={emailProviderKey(account)} />
                      </TableCell>
                      <TableCell align="center">
                        <div>{account.name}</div>
                        {emailProviderKey(account) === "custom" &&
                          account.imapHost && (
                            <div className={classes.rowNote}>
                              {te("note.imap", {
                                host: account.imapHost,
                                interpolation: { escapeValue: false }
                              })}
                            </div>
                          )}
                      </TableCell>
                      <TableCell align="center">
                        {account.address || "—"}
                      </TableCell>
                      <TableCell align="center">
                        {renderEmailStatus(account)}
                      </TableCell>
                      <TableCell align="center">
                        {renderEmailSessionButtons(account)}
                      </TableCell>
                      <TableCell align="center">
                        {formatEmailDate(
                          account.lastSyncAt || account.updatedAt
                        )}
                      </TableCell>
                      <TableCell align="center" />
                      <TableCell align="center">
                        <Tooltip title={te("actions.edit")}>
                          <IconButton
                            size="small"
                            aria-label={te("actions.edit")}
                            onClick={() => openEmailModal("edit", account)}
                          >
                            <Edit />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
              </>
            )}
          </TableBody>
        </Table>
      </Paper>
    </MainContainer>
  );
};

export default Connections;
