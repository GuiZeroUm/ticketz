import React, { useEffect, useState } from "react";

import { makeStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import Drawer from "@material-ui/core/Drawer";
import Link from "@material-ui/core/Link";
import Avatar from "@material-ui/core/Avatar";
import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import CircularProgress from "@material-ui/core/CircularProgress";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import ListItemText from "@material-ui/core/ListItemText";
import Chip from "@material-ui/core/Chip";

import { i18n } from "../../translate/i18n";
import {
  formatWhatsappContactName,
  formatWhatsappContactNumber
} from "../../helpers/formatWhatsappDisplay";

import ContactDrawerSkeleton from "../ContactDrawerSkeleton";
import WhatsMarked from "react-whatsmarked";
import { CardHeader } from "@material-ui/core";
import ContactModal from "../ContactModal";
import SgaContactCard from "../SgaContactCard";
import { TicketNotes } from "../TicketNotes";
import { generateColor } from "../../helpers/colorGenerator";
import { getInitials } from "../../helpers/getInitials";
import { TagsContainer } from "../TagsContainer";
import useSettings from "../../hooks/useSettings";
import api from "../../services/api";

const drawerWidth = 320;

const useStyles = makeStyles(theme => ({
  drawer: {
    width: drawerWidth,
    flexShrink: 0,
    [theme.breakpoints.down(1400)]: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0
    }
  },

  drawerHidden: {
    display: "none"
  },

  drawerPaper: {
    width: drawerWidth,
    display: "flex",
    borderTop: "1px solid rgba(0, 0, 0, 0.12)",
    borderRight: "1px solid rgba(0, 0, 0, 0.12)",
    borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4
  },
  header: {
    display: "flex",
    borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
    alignItems: "center",
    padding: theme.spacing(0, 1),
    minHeight: "73px",
    justifyContent: "flex-start"
  },
  content: {
    display: "flex",

    flexDirection: "column",
    padding: "8px 0px 8px 8px",
    height: "100%",
    overflowY: "scroll",
    ...theme.scrollbarStyles
  },

  contactAvatar: {
    margin: 15,
    width: 100,
    height: 100
  },

  contactHeader: {
    display: "flex",
    padding: 8,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    "& > *": {
      margin: 4
    }
  },

  contactDetails: {
    marginTop: 8,
    padding: 8,
    display: "flex",
    flexDirection: "column"
  },
  contactExtraInfo: {
    marginTop: 4,
    padding: 6
  },
  participants: {
    marginTop: 8,
    padding: 8
  },
  participantsHeader: {
    padding: theme.spacing(0, 1, 1)
  },
  participantItem: {
    borderTop: "1px solid rgba(0, 0, 0, 0.08)"
  },
  participantRole: {
    height: 22,
    fontSize: 11
  },
  participantsStatus: {
    display: "flex",
    justifyContent: "center",
    padding: theme.spacing(3),
    color: theme.palette.text.secondary
  }
}));

const ContactDrawer = ({
  open,
  handleDrawerClose,
  contact,
  ticket,
  loading
}) => {
  const classes = useStyles();
  const { getSetting } = useSettings();
  const formattedContactName = formatWhatsappContactName(contact, ticket);
  const isWhatsappGroup = !!ticket.isGroup;
  const isGroupConversation = ticket.isGroup && contact?.groupMode !== "ticket";

  const [modalOpen, setModalOpen] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState(false);
  const [participantContactId, setParticipantContactId] = useState(null);

  useEffect(() => {
    getSetting("tagsMode").then(res => {
      setShowTags(["contact", "both"].includes(res));
    });

    setOpenForm(false);
  }, [open, contact]);

  useEffect(() => {
    if (!open || !isWhatsappGroup || !ticket?.id) {
      setParticipants([]);
      setParticipantsError(false);
      return undefined;
    }

    let active = true;
    setParticipantsLoading(true);
    setParticipantsError(false);
    api
      .get(`/whatsapp-groups/${ticket.id}/participants`)
      .then(({ data }) => {
        if (active) setParticipants(data.participants || []);
      })
      .catch(() => {
        if (active) setParticipantsError(true);
      })
      .finally(() => {
        if (active) setParticipantsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, isWhatsappGroup, ticket?.id]);

  return (
    <>
      <Drawer
        className={open ? classes.drawer : classes.drawerHidden}
        variant="persistent"
        anchor="right"
        open={open}
        PaperProps={{ style: { position: "absolute" } }}
        BackdropProps={{ style: { position: "absolute" } }}
        ModalProps={{
          container: document.getElementById("drawer-container"),
          style: { position: "absolute" }
        }}
        classes={{
          paper: classes.drawerPaper
        }}
      >
        <div className={classes.header}>
          <IconButton onClick={handleDrawerClose}>
            <CloseIcon />
          </IconButton>
          <Typography style={{ justifySelf: "center" }}>
            {i18n.t(
              isWhatsappGroup
                ? "contactDrawer.groupHeader"
                : "contactDrawer.header"
            )}
          </Typography>
        </div>
        {loading ? (
          <ContactDrawerSkeleton classes={classes} />
        ) : (
          <div className={classes.content}>
            <div className={classes.contactHeader}>
              <CardHeader
                onClick={() => {}}
                style={{ cursor: "pointer", width: "100%", padding: 0 }}
                titleTypographyProps={{ noWrap: true }}
                subheaderTypographyProps={{ noWrap: true }}
                avatar={
                  <Avatar
                    src={contact.profilePicUrl}
                    alt="contact_image"
                    style={{
                      width: 60,
                      height: 60,
                      backgroundColor: generateColor(contact?.number),
                      color: "white",
                      fontWeight: "bold"
                    }}
                  >
                    {getInitials(formattedContactName)}
                  </Avatar>
                }
                title={
                  <>
                    <Typography>{formattedContactName}</Typography>
                  </>
                }
                subheader={
                  <>
                    <Typography style={{ fontSize: 12 }}>
                      {formatWhatsappContactNumber(contact)}
                    </Typography>
                    <Typography style={{ fontSize: 12 }}>
                      <Link href={`mailto:${contact.email}`}>
                        {contact.email}
                      </Link>
                    </Typography>
                  </>
                }
              />
            </div>
            {showTags && <TagsContainer contact={contact} />}
            {!isWhatsappGroup && (
              <SgaContactCard contactId={contact?.id} open={open} />
            )}
            {contact?.extraInfo?.length > 0 && (
              <div className={classes.contactExtraInfo}>
                <Typography variant="subtitle1">
                  {i18n.t("contactModal.form.extraInfo")}
                </Typography>
                {contact?.extraInfo?.map(info => (
                  <WhatsMarked>{`*${info?.name}:* ${info?.value}`}</WhatsMarked>
                ))}
              </div>
            )}
            {isWhatsappGroup && (
              <Paper square variant="outlined" className={classes.participants}>
                <Typography
                  variant="subtitle1"
                  className={classes.participantsHeader}
                >
                  {i18n.t("contactDrawer.participants")} ({participants.length})
                </Typography>
                {participantsLoading ? (
                  <div className={classes.participantsStatus}>
                    <CircularProgress size={24} />
                  </div>
                ) : participantsError ? (
                  <Typography className={classes.participantsStatus}>
                    {i18n.t("contactDrawer.participantsUnavailable")}
                  </Typography>
                ) : (
                  <List disablePadding>
                    {participants.map(participant => (
                      <ListItem
                        className={classes.participantItem}
                        key={participant.id}
                        button={!!participant.contactId}
                        onClick={() => {
                          if (!participant.contactId) return;
                          setParticipantContactId(participant.contactId);
                          setModalOpen(true);
                        }}
                      >
                        <ListItemAvatar>
                          <Avatar
                            src={participant.profilePicUrl}
                            style={{
                              backgroundColor: generateColor(
                                participant.number
                              ),
                              color: "white",
                              fontWeight: "bold"
                            }}
                          >
                            {getInitials(participant.name)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={`${participant.name}${
                            participant.isMe
                              ? ` (${i18n.t("contactDrawer.you")})`
                              : ""
                          }`}
                          secondary={formatWhatsappContactNumber(participant)}
                        />
                        {participant.admin && (
                          <Chip
                            className={classes.participantRole}
                            variant="outlined"
                            color="primary"
                            label={i18n.t(
                              participant.admin === "superadmin"
                                ? "contactDrawer.owner"
                                : "contactDrawer.admin"
                            )}
                          />
                        )}
                      </ListItem>
                    ))}
                  </List>
                )}
              </Paper>
            )}
            {!isGroupConversation && (
              <Button
                variant="outlined"
                color="primary"
                onClick={() => setModalOpen(!openForm)}
                style={{ fontSize: 12, marginTop: 8 }}
              >
                {i18n.t("contactDrawer.buttons.edit")}
              </Button>
            )}
            {!isGroupConversation && (
              <Paper
                square
                variant="outlined"
                className={classes.contactDetails}
              >
                <Typography variant="subtitle1" style={{ marginBottom: 10 }}>
                  {i18n.t("ticketOptionsMenu.appointmentsModal.title")}
                </Typography>
                <TicketNotes ticket={ticket} />
              </Paper>
            )}
            <ContactModal
              open={modalOpen}
              onClose={() => {
                setModalOpen(false);
                setParticipantContactId(null);
              }}
              contactId={participantContactId || contact.id}
            ></ContactModal>
          </div>
        )}
      </Drawer>
    </>
  );
};

export default ContactDrawer;
