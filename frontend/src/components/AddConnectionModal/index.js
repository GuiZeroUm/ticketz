import React from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import {
  ButtonBase,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Typography
} from "@material-ui/core";
import { Close } from "@material-ui/icons";

import { i18n } from "../../translate/i18n";
import {
  ChannelIcon,
  CONNECTION_PROVIDERS,
  providerColors
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
    fontSize: theme.isStardew ? 17 : 13
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: theme.spacing(2.5)
  },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  groupLabel: {
    fontSize: theme.isStardew ? 14 : 10.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: theme.palette.text.secondary
  },
  options: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 8
  },
  option: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 10,
    padding: 12,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 12,
    background: theme.palette.background.paper,
    textAlign: "left",
    transition: "border-color 120ms ease",
    "&:hover, &:focus-visible": {
      borderColor: theme.palette.primary.main
    }
  },
  optionDisabled: {
    opacity: 0.55,
    cursor: "not-allowed"
  },
  iconBox: {
    width: 36,
    height: 36,
    flex: "none",
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2
  },
  optionLabel: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    fontWeight: 600,
    fontSize: theme.isStardew ? 17 : 13,
    color: theme.palette.text.primary
  },
  optionHint: {
    fontSize: theme.isStardew ? 15 : 12,
    color: theme.palette.text.secondary,
    lineHeight: 1.35
  },
  tag: {
    height: 18,
    padding: "0 6px",
    borderRadius: 5,
    background: theme.palette.action.selected,
    color: theme.palette.text.secondary,
    fontSize: theme.isStardew ? 13 : 10.5,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center"
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
  }
}));

const t = key => i18n.t(`emailChannel.connections.${key}`);

const PickerOption = ({ providerKey, labelKey, disabled, tag, onPick }) => {
  const classes = useStyles();
  const theme = useTheme();
  const provider = CONNECTION_PROVIDERS[providerKey];
  const { color, tint } = providerColors(theme, provider);
  return (
    <ButtonBase
      focusRipple
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={`${classes.option} ${disabled ? classes.optionDisabled : ""}`}
      style={disabled ? { pointerEvents: "auto" } : undefined}
      onClick={disabled ? undefined : onPick}
    >
      <span className={classes.iconBox} style={{ background: tint, color }}>
        <ChannelIcon name={provider.icon} />
      </span>
      <span className={classes.optionText}>
        <span className={classes.optionLabel}>
          {t(`picker.options.${labelKey}.label`)}
          {tag && <span className={classes.tag}>{tag}</span>}
        </span>
        <span className={classes.optionHint}>
          {t(`picker.options.${labelKey}.hint`)}
        </span>
      </span>
    </ButtonBase>
  );
};

/**
 * "Adicionar conexão" picker. The WhatsApp group offers only the flow the
 * company already has (QR Code for "normal", API Oficial for "meta"); both
 * hand off to the existing WhatsApp add flow through `onPickWhatsApp`.
 */
const AddConnectionModal = ({
  open,
  onClose,
  whatsappMode,
  onPickWhatsApp,
  onPickEmail
}) => {
  const classes = useStyles();
  const isMeta = whatsappMode === "meta";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      aria-labelledby="add-connection-title"
    >
      <div className={classes.header}>
        <div className={classes.headerText}>
          <Typography
            id="add-connection-title"
            component="h2"
            className={classes.title}
          >
            {t("picker.title")}
          </Typography>
          <Typography className={classes.subtitle}>
            {t("picker.subtitle")}
          </Typography>
        </div>
        <IconButton
          size="small"
          aria-label={t("form.close")}
          title={t("form.close")}
          onClick={onClose}
        >
          <Close />
        </IconButton>
      </div>
      <DialogContent className={classes.content}>
        <div className={classes.group}>
          <span className={classes.groupLabel}>
            {t("picker.groups.whatsapp")}
          </span>
          <div className={classes.options}>
            {isMeta ? (
              <PickerOption
                providerKey="waapi"
                labelKey="whatsappApi"
                onPick={onPickWhatsApp}
              />
            ) : (
              <PickerOption
                providerKey="wa"
                labelKey="whatsappQr"
                onPick={onPickWhatsApp}
              />
            )}
          </div>
        </div>
        <div className={classes.group}>
          <span className={classes.groupLabel}>{t("picker.groups.email")}</span>
          <div className={classes.options}>
            <PickerOption
              providerKey="gmail"
              labelKey="gmail"
              onPick={() => onPickEmail("gmail")}
            />
            <PickerOption
              providerKey="outlook"
              labelKey="outlook"
              disabled
              tag={t("picker.soon")}
            />
            <PickerOption
              providerKey="icloud"
              labelKey="icloud"
              onPick={() => onPickEmail("icloud")}
            />
            <PickerOption
              providerKey="custom"
              labelKey="custom"
              onPick={() => onPickEmail("custom")}
            />
          </div>
        </div>
      </DialogContent>
      <DialogActions className={classes.footer}>
        <span className={classes.footerNote}>{t("picker.footer")}</span>
        <Button variant="outlined" onClick={onClose}>
          {t("form.cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddConnectionModal;
