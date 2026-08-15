import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import { Switch, Tooltip, Typography } from "@material-ui/core";
import DragIndicatorIcon from "@material-ui/icons/DragIndicator";
import ChevronRightIcon from "@material-ui/icons/ChevronRight";
import AttachFileIcon from "@material-ui/icons/AttachFile";
import ExitToAppIcon from "@material-ui/icons/ExitToApp";
import CallSplitIcon from "@material-ui/icons/CallSplit";

import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => {
  const wa = theme.palette.whatsapp;

  return {
    bubble: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      width: "94%",
      maxWidth: 390,
      marginLeft: "auto",
      padding: 10,
      borderRadius: "14px 14px 4px 14px",
      color: wa.ink,
      backgroundColor: wa.bubble,
      boxShadow: "0 0 0 1px rgba(17,27,33,.04), 0 1px 2px rgba(17,27,33,.12)",
      transition: "transform 160ms cubic-bezier(.23,1,.32,1)"
    },
    inactive: {
      backgroundColor: wa.bubbleMuted,
      color: wa.muted
    },
    handle: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flex: "none",
      width: 32,
      height: 44,
      marginRight: 8,
      padding: 0,
      border: "none",
      borderRadius: 8,
      color: wa.muted,
      background: "transparent",
      cursor: "grab",
      transition: "background-color 120ms",
      "&:hover": { backgroundColor: wa.hover, color: wa.ink },
      "&:active": { cursor: "grabbing" },
      "&:focus-visible": { outline: `2px solid ${wa.focus}` }
    },
    body: {
      flex: 1,
      minWidth: 0,
      cursor: "pointer",
      borderRadius: 6,
      "&:focus-visible": { outline: `2px solid ${wa.focus}` }
    },
    titleRow: {
      display: "flex",
      alignItems: "center"
    },
    key: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 20,
      height: 20,
      marginRight: 8,
      padding: "0 4px",
      borderRadius: 999,
      backgroundColor: wa.hover,
      color: wa.muted,
      fontSize: 10,
      fontWeight: 700,
      fontVariantNumeric: "tabular-nums"
    },
    title: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: 13,
      fontWeight: 700
    },
    preview: {
      margin: "4px 0 0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: 11,
      lineHeight: "16px",
      color: wa.copy
    },
    state: {
      display: "flex",
      alignItems: "center",
      marginTop: 6,
      fontSize: 10,
      fontWeight: 600,
      color: wa.muted
    },
    stateActive: { color: wa.status },
    stateIcon: { fontSize: 13, marginRight: 3 },
    branch: {
      display: "inline-flex",
      alignItems: "center",
      marginTop: 8,
      padding: "2px 4px 2px 8px",
      border: "none",
      borderRadius: 999,
      backgroundColor: wa.badge,
      color: wa.status,
      fontSize: 10.5,
      fontWeight: 600,
      cursor: "pointer",
      "&:focus-visible": { outline: `2px solid ${wa.focus}` }
    },
    branchIcon: { fontSize: 14 },
    switchCell: {
      display: "flex",
      flex: "none",
      alignItems: "center",
      height: 44,
      paddingLeft: 2
    },
    // Reproduz as medidas do switch da referência (trilho 40x23, thumb 19).
    switchRoot: {
      width: 40,
      height: 23,
      padding: 0,
      overflow: "visible"
    },
    switchBase: {
      padding: 2,
      color: "#fff",
      "&$switchChecked": {
        transform: "translateX(17px)",
        color: "#fff",
        "& + $switchTrack": {
          backgroundColor: wa.switch,
          opacity: 1
        }
      }
    },
    switchChecked: {},
    switchThumb: {
      width: 19,
      height: 19,
      boxShadow: "0 1px 3px rgba(0,0,0,.3)"
    },
    switchTrack: {
      borderRadius: 999,
      backgroundColor: wa.muted,
      opacity: 1
    }
  };
});

const MessageBubble = ({
  option,
  index,
  total,
  forwardQueueName,
  onToggle,
  onEdit,
  onOpenBranch,
  onMove
}) => {
  const classes = useStyles();

  const title = option.title || i18n.t("chatbotFlow.noTitle");
  const childrenCount = option.childrenCount || 0;

  const handleKeyDown = event => {
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      onMove(index, index - 1);
    }
    if (event.key === "ArrowDown" && index < total - 1) {
      event.preventDefault();
      onMove(index, index + 1);
    }
  };

  const renderState = () => {
    if (!option.isActive) {
      return (
        <div className={classes.state}>{i18n.t("chatbotFlow.inactive")}</div>
      );
    }
    if (option.exitChatbot) {
      return (
        <div className={`${classes.state} ${classes.stateActive}`}>
          <ExitToAppIcon className={classes.stateIcon} />
          {i18n.t("chatbotFlow.exitsChatbot")}
        </div>
      );
    }
    if (option.forwardQueueId) {
      return (
        <div className={`${classes.state} ${classes.stateActive}`}>
          <CallSplitIcon className={classes.stateIcon} />
          {i18n.t("chatbotFlow.forwardsTo", {
            queue: forwardQueueName || "—"
          })}
        </div>
      );
    }
    return (
      <div className={`${classes.state} ${classes.stateActive}`}>
        {i18n.t("chatbotFlow.activeKey", { key: option.option })}
      </div>
    );
  };

  return (
    <article
      data-sortable-item
      className={`${classes.bubble} ${option.isActive ? "" : classes.inactive}`}
    >
      <button
        type="button"
        data-drag-handle
        className={classes.handle}
        onKeyDown={handleKeyDown}
        aria-label={i18n.t("chatbotFlow.moveHandle", { title })}
      >
        <DragIndicatorIcon fontSize="small" />
      </button>

      {/* Um div com role=button: dentro dele existe o botão da ramificação, e
          botão dentro de botão não é HTML válido. */}
      <div
        role="button"
        tabIndex={0}
        className={classes.body}
        onClick={onEdit}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onEdit();
          }
        }}
      >
        <div className={classes.titleRow}>
          <span className={classes.key}>{option.option || "—"}</span>
          <Typography component="div" className={classes.title}>
            {title}
          </Typography>
          {option.mediaName && (
            <Tooltip title={option.mediaName}>
              <AttachFileIcon className={classes.stateIcon} />
            </Tooltip>
          )}
        </div>
        <p className={classes.preview}>
          {option.message || i18n.t("chatbotFlow.noMessage")}
        </p>
        {renderState()}

        {!option.exitChatbot && !option.forwardQueueId && (
          <button
            type="button"
            className={classes.branch}
            onClick={event => {
              event.stopPropagation();
              onOpenBranch();
            }}
          >
            {childrenCount > 0
              ? i18n.t("chatbotFlow.answers", { total: childrenCount })
              : i18n.t("chatbotFlow.createAnswers")}
            <ChevronRightIcon className={classes.branchIcon} />
          </button>
        )}
      </div>

      <div className={classes.switchCell}>
        <Switch
          checked={!!option.isActive}
          onChange={event => onToggle(event.target.checked)}
          inputProps={{
            "aria-label": option.isActive
              ? i18n.t("chatbotFlow.deactivate", { title })
              : i18n.t("chatbotFlow.activate", { title })
          }}
          classes={{
            root: classes.switchRoot,
            switchBase: classes.switchBase,
            checked: classes.switchChecked,
            thumb: classes.switchThumb,
            track: classes.switchTrack
          }}
        />
      </div>
    </article>
  );
};

export default MessageBubble;
