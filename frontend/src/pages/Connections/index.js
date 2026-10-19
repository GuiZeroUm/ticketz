import { AuthContext } from "../../context/Auth/AuthContext";
import StardewEmblem from "../../components/StardewEmblem";
import React, { useState, useCallback, useContext, useEffect } from "react";
import { toast } from "react-toastify";
import { format, parseISO } from "date-fns";
import { useHistory, useLocation } from "react-router-dom";

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
  Chip
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
  SettingsBackupRestore,
  HourglassEmpty,
  ReportProblemOutlined,
  ErrorOutline
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
  startGmailOAuth,
  toastEmailError,
  translateEmailError
} from "../../helpers/emailConnections";

const te = (key, options) => i18n.t(`emailChannel.connections.${key}`, options);

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
  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: theme.spacing(0.5, 0.5, 1.5)
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
  const provider = CONNECTION_PROVIDERS[providerKey];
  return (
    <span
      className={classes.channelChip}
      style={{ background: provider.tint, color: provider.color }}
    >
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
  const history = useHistory();
  const location = useLocation();
  const { enabled: emailEnabled } = useEmailAvailability();
  const {
    accounts: emailAccounts,
    loading: emailLoading,
    reload: reloadEmailAccounts
  } = useEmailAccounts(emailEnabled);
  const [channelFilter, setChannelFilter] = useState("all");
  const [addConnectionOpen, setAddConnectionOpen] = useState(false);
  const [emailModal, setEmailModal] = useState({
    open: false,
    mode: "create",
    preset: null,
    account: null
  });

  // Google OAuth comes back to /connections?email=connected|error&code=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get("email");
    if (!result) return;
    if (result === "connected") {
      toast.success(te("toasts.gmailConnected"));
    } else if (result === "error") {
      toastEmailError(params.get("code") || "generic");
    }
    params.delete("email");
    params.delete("code");
    const search = params.toString();
    history.replace({
      pathname: location.pathname,
      search: search ? `?${search}` : "",
      hash: location.hash
    });
  }, [location.search, location.pathname, location.hash, history]);

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
      await startGmailOAuth({ name: account.name, queueId: account.queueId });
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

  const emailStatusInfo = account => {
    const isGmail = emailProviderKey(account) === "gmail";
    switch (account.status) {
      case "active":
        return {
          key: "active",
          color: theme.isStardew ? theme.stardew.green : "#16A34A",
          Icon: SignalCellular4Bar
        };
      case "connecting":
        return {
          key: "connecting",
          color: theme.palette.text.secondary,
          Icon: HourglassEmpty
        };
      case "reauth_required":
        return {
          key: isGmail ? "authExpired" : "invalidPassword",
          color: "#B45309",
          Icon: ReportProblemOutlined
        };
      case "disabled":
        return {
          key: "disabled",
          color: "#DC2626",
          Icon: SignalCellularConnectedNoInternet0Bar
        };
      default:
        return { key: "error", color: "#DC2626", Icon: ErrorOutline };
    }
  };

  const renderEmailStatus = account => {
    const { key, color, Icon } = emailStatusInfo(account);
    const description =
      (key === "error" && translateEmailError(account.lastError?.code)) ||
      te(`status.${key}.title`);
    return (
      <div className={classes.customTableCell}>
        <CustomToolTip title={te(`status.${key}.label`)} content={description}>
          <span className={classes.emailStatus} style={{ color }}>
            <Icon fontSize="small" />
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
  const tableLoading = loading || (showEmailRows && emailLoading);
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
      color: CONNECTION_PROVIDERS.wa.color,
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
            >
              {i18n.t("connections.buttons.add")}
            </Button>
          )}
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper className={classes.mainPaper} variant="outlined">
        {emailEnabled && (
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
        )}
        <Table size="small">
          <TableHead>
            <TableRow>
              {emailEnabled && (
                <TableCell align="center">{te("table.channel")}</TableCell>
              )}
              <TableCell align="center">
                {i18n.t("connections.table.contact")}
              </TableCell>
              <TableCell align="center">
                {i18n.t("connections.table.name")}
              </TableCell>
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
                {i18n.t("connections.table.default")}
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
                  whatsApps?.length > 0 &&
                  whatsApps.map(whatsApp => (
                    <TableRow key={whatsApp.id}>
                      {emailEnabled && (
                        <TableCell align="center">
                          <ChannelChip
                            providerKey={
                              whatsApp.apiMode === "official" ? "waapi" : "wa"
                            }
                          />
                        </TableCell>
                      )}
                      <TableCell align="center">
                        {formatWhatsappDigits(whatsApp.number) || "—"}
                      </TableCell>
                      <TableCell align="center">{whatsApp.name}</TableCell>
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
                  emailAccounts.map(account => (
                    <TableRow key={`email-${account.id}`}>
                      <TableCell align="center">
                        <ChannelChip providerKey={emailProviderKey(account)} />
                      </TableCell>
                      <TableCell align="center">
                        {account.address || "—"}
                      </TableCell>
                      <TableCell align="center">
                        <div>{account.name}</div>
                        {emailProviderKey(account) === "custom" &&
                          account.imapHost && (
                            <div className={classes.rowNote}>
                              {te("note.imap", { host: account.imapHost })}
                            </div>
                          )}
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
