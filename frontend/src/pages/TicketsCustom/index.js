import React from "react";
import { useParams } from "react-router-dom";
import Grid from "@material-ui/core/Grid";
import Paper from "@material-ui/core/Paper";
import { makeStyles } from "@material-ui/core/styles";

import TicketsManager from "../../components/TicketsManagerTabs/";
import Ticket from "../../components/Ticket/";

import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  chatContainer: {
    flex: 1,
    height: `calc(100% - var(--altura-cabecalho, 60px))`,
    overflowY: "hidden",
    padding: 12
  },

  chatPapper: {
    gap: 12,
    display: "flex",
    height: "100%"
  },

  contactsWrapper: {
    display: "flex",
    height: "100%",
    flexDirection: "column",
    overflowY: "hidden",
    width: 360,
    flex: "0 0 360px",
    maxWidth: 420,
    paddingRight: 12,
    [theme.breakpoints.down("md")]: { width: 320, flexBasis: 320 }
  },
  messagesWrapper: {
    overflow: "hidden",
    display: "flex",
    height: "100%",
    flexDirection: "column",
    flexGrow: 1,
    maxWidth: "unset",
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`
  },
  welcomeMsg: {
    display: "flex",
    justifyContent: "space-evenly",
    alignItems: "center",
    height: "100%",
    textAlign: "center"
  }
}));

const TicketsCustom = () => {
  const classes = useStyles();
  const { ticketId } = useParams();

  return (
    <div className={classes.chatContainer}>
      <div className={classes.chatPapper}>
        <Grid container spacing={0}>
          <Grid item className={classes.contactsWrapper}>
            <TicketsManager />
          </Grid>
          <Grid item className={classes.messagesWrapper}>
            {ticketId ? (
              <>
                <Ticket />
              </>
            ) : (
              <Paper square variant="outlined" className={classes.welcomeMsg}>
                <span>{i18n.t("chat.noTicketMessage")}</span>
              </Paper>
            )}
          </Grid>
        </Grid>
      </div>
    </div>
  );
};

export default TicketsCustom;
