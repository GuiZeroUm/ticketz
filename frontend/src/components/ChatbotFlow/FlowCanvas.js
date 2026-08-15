import React from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import { Breadcrumbs, Link, Typography } from "@material-ui/core";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";

import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => {
  const wa = theme.palette.whatsapp;

  return {
    card: {
      overflow: "hidden",
      borderRadius: 22,
      border: `1px solid ${wa.line}`,
      backgroundColor: wa.canvas,
      boxShadow: "0 14px 32px rgba(15,23,42,0.1)"
    },
    header: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 16px",
      borderBottom: `1px solid ${wa.line}`,
      backgroundColor: wa.toolbar,
      color: wa.ink
    },
    avatar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flex: "none",
      width: 36,
      height: 36,
      marginRight: 12,
      borderRadius: "50%",
      backgroundColor: wa.badge,
      color: wa.status
    },
    headerText: { flex: 1, minWidth: 0 },
    headerTitle: { fontSize: 13.5, fontWeight: 700 },
    headerSubtitle: { fontSize: 11, color: wa.muted },
    counter: {
      flex: "none",
      marginLeft: 12,
      padding: "4px 10px",
      borderRadius: 999,
      backgroundColor: wa.badge,
      color: wa.status,
      fontSize: 10.5,
      fontWeight: 600,
      fontVariantNumeric: "tabular-nums"
    },
    breadcrumbs: {
      padding: "8px 16px",
      borderBottom: `1px solid ${wa.line}`,
      backgroundColor: wa.toolbar,
      color: wa.muted,
      fontSize: 12
    },
    crumb: { fontSize: 12, color: wa.status, cursor: "pointer" },
    crumbCurrent: { fontSize: 12, color: wa.ink, fontWeight: 600 },
    canvas: {
      position: "relative",
      minHeight: 320,
      padding: 16,
      backgroundPosition: "center",
      backgroundSize: "cover"
    },
    footer: {
      padding: "12px 16px",
      borderTop: `1px solid ${wa.line}`,
      backgroundColor: wa.toolbar,
      color: wa.muted,
      fontSize: 10.5,
      lineHeight: "16px"
    },
    srOnly: {
      position: "absolute",
      width: 1,
      height: 1,
      overflow: "hidden",
      clip: "rect(0 0 0 0)",
      whiteSpace: "nowrap"
    }
  };
});

const FlowCanvas = ({
  activeCount,
  totalCount,
  path,
  onNavigate,
  announcement,
  children
}) => {
  const classes = useStyles();
  const theme = useTheme();

  return (
    <section className={classes.card}>
      <header className={classes.header}>
        <div className={classes.avatar}>
          <WhatsAppIcon />
        </div>
        <div className={classes.headerText}>
          <div className={classes.headerTitle}>
            {i18n.t("chatbotFlow.title")}
          </div>
          <div className={classes.headerSubtitle}>
            {i18n.t("chatbotFlow.subtitle")}
          </div>
        </div>
        <span className={classes.counter}>
          {i18n.t("chatbotFlow.activeCount", {
            active: activeCount,
            total: totalCount
          })}
        </span>
      </header>

      {path.length > 0 && (
        <div className={classes.breadcrumbs}>
          <Breadcrumbs separator="›" aria-label={i18n.t("chatbotFlow.path")}>
            <Link
              component="button"
              type="button"
              className={classes.crumb}
              onClick={() => onNavigate(0)}
            >
              {i18n.t("chatbotFlow.root")}
            </Link>
            {path.map((crumb, index) =>
              index === path.length - 1 ? (
                <Typography key={crumb.id} className={classes.crumbCurrent}>
                  {crumb.title}
                </Typography>
              ) : (
                <Link
                  key={crumb.id}
                  component="button"
                  type="button"
                  className={classes.crumb}
                  onClick={() => onNavigate(index + 1)}
                >
                  {crumb.title}
                </Link>
              )
            )}
          </Breadcrumbs>
        </div>
      )}

      <div
        className={classes.canvas}
        style={{
          backgroundImage: `url('${theme.palette.whatsapp.background}')`
        }}
      >
        {children}
      </div>

      <footer className={classes.footer}>{i18n.t("chatbotFlow.footer")}</footer>
      <div className={classes.srOnly} aria-live="polite">
        {announcement}
      </div>
    </section>
  );
};

export default FlowCanvas;
