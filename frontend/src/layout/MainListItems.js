import Navegacao from "./Navegacao";
import React, { useContext, useEffect, useReducer, useState } from "react";

import { Badge } from "@material-ui/core";
import DashboardOutlinedIcon from "@material-ui/icons/DashboardOutlined";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import SyncAltIcon from "@material-ui/icons/SyncAlt";
import SettingsOutlinedIcon from "@material-ui/icons/SettingsOutlined";
import PeopleAltOutlinedIcon from "@material-ui/icons/PeopleAltOutlined";
import ContactPhoneOutlinedIcon from "@material-ui/icons/ContactPhoneOutlined";
import AccountTreeOutlinedIcon from "@material-ui/icons/AccountTreeOutlined";
import FlashOnIcon from "@material-ui/icons/FlashOn";
import HelpOutlineIcon from "@material-ui/icons/HelpOutline";
import ChatOutlinedIcon from "@material-ui/icons/ChatOutlined";
import EventIcon from "@material-ui/icons/Event";

import LocalOfferIcon from "@material-ui/icons/LocalOffer";
import EventAvailableIcon from "@material-ui/icons/EventAvailable";
import PeopleIcon from "@material-ui/icons/People";
import ListIcon from "@material-ui/icons/ListAlt";
import AnnouncementIcon from "@material-ui/icons/Announcement";
import ForumIcon from "@material-ui/icons/Forum";
import LocalAtmIcon from "@material-ui/icons/LocalAtm";
import BorderColorIcon from "@material-ui/icons/BorderColor";
import { WhatsAppsContext } from "../context/WhatsApp/WhatsAppsContext";
import { AuthContext } from "../context/Auth/AuthContext";
import { SocketContext } from "../context/Socket/SocketContext";
import { isArray } from "lodash";
import api from "../services/api";
import toastError from "../errors/toastError";

const reducer = (state, action) => {
  if (action.type === "LOAD_CHATS") {
    const chats = action.payload;
    const newChats = [];

    if (isArray(chats)) {
      chats.forEach(chat => {
        const chatIndex = state.findIndex(u => u.id === chat.id);
        if (chatIndex !== -1) {
          state[chatIndex] = chat;
        } else {
          newChats.push(chat);
        }
      });
    }

    return [...state, ...newChats];
  }

  if (action.type === "UPDATE_CHATS") {
    const chat = action.payload;
    const chatIndex = state.findIndex(u => u.id === chat.id);

    if (chatIndex !== -1) {
      state[chatIndex] = chat;
      return [...state];
    } else {
      return [chat, ...state];
    }
  }

  if (action.type === "DELETE_CHAT") {
    const chatId = action.payload;

    const chatIndex = state.findIndex(u => u.id === chatId);
    if (chatIndex !== -1) {
      state.splice(chatIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }

  if (action.type === "CHANGE_CHAT") {
    const changedChats = state.map(chat => {
      if (chat.id === action.payload.chat.id) {
        return action.payload.chat;
      }
      return chat;
    });
    return changedChats;
  }
};

const MainListItems = props => {
  const { drawerClose, drawerOpen } = props;
  const { whatsApps } = useContext(WhatsAppsContext);
  const { user } = useContext(AuthContext);
  const [connectionWarning, setConnectionWarning] = useState(false);

  const [showCampaigns, setShowCampaigns] = useState(false);
  const [invisible, setInvisible] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam] = useState("");
  const [chats, dispatch] = useReducer(reducer, []);

  const socketManager = useContext(SocketContext);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchChats();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParam, pageNumber]);

  useEffect(() => {
    const companyId = localStorage.getItem("companyId");
    const socket = socketManager.GetSocket(companyId);

    const onCompanyChatMainListItems = data => {
      if (data.action === "new-message") {
        dispatch({ type: "CHANGE_CHAT", payload: data });
      }
      if (data.action === "update") {
        dispatch({ type: "CHANGE_CHAT", payload: data });
      }
    };

    socket.on(`company-${companyId}-chat`, onCompanyChatMainListItems);
    return () => {
      socket.disconnect();
    };
  }, [socketManager]);

  useEffect(() => {
    let unreadsCount = 0;
    if (chats.length > 0) {
      for (let chat of chats) {
        for (let chatUser of chat.users) {
          if (chatUser.userId === user.id) {
            unreadsCount += chatUser.unreads;
          }
        }
      }
    }
    if (unreadsCount > 0) {
      setInvisible(false);
    } else {
      setInvisible(true);
    }
  }, [chats, user.id]);

  useEffect(() => {
    if (localStorage.getItem("cshow")) {
      setShowCampaigns(true);
    }
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (whatsApps.length > 0) {
        const offlineWhats = whatsApps.filter(whats => {
          return (
            whats.status === "qrcode" ||
            whats.status === "PAIRING" ||
            whats.status === "DISCONNECTED" ||
            whats.status === "TIMEOUT" ||
            whats.status === "OPENING"
          );
        });
        if (offlineWhats.length > 0) {
          setConnectionWarning(true);
        } else {
          setConnectionWarning(false);
        }
      }
    }, 2000);
    return () => clearTimeout(delayDebounceFn);
  }, [whatsApps]);

  const fetchChats = async () => {
    try {
      const { data } = await api.get("/chats/", {
        params: { searchParam, pageNumber }
      });
      dispatch({ type: "LOAD_CHATS", payload: data.records });
    } catch (err) {
      toastError(err);
    }
  };

  const item = (to, chave, icone) => ({
    to,
    chave: `mainDrawer.listItems.${chave}`,
    icone
  });
  const administrador = user.profile === "admin";
  const grupos = [
    {
      chave: "redesign.operacao",
      itens: [
        ...(administrador
          ? [
              {
                to: "/",
                chave: "redesign.visaoGeral",
                icone: <DashboardOutlinedIcon />
              }
            ]
          : []),
        item("/tickets", "tickets", <WhatsAppIcon />),
        item(
          "/chats",
          "chats",
          <Badge color="secondary" variant="dot" invisible={invisible}>
            <ForumIcon />
          </Badge>
        ),
        item("/todolist", "tasks", <BorderColorIcon />)
      ]
    },
    {
      chave: "redesign.relacionamento",
      itens: [
        item("/contacts", "contacts", <ContactPhoneOutlinedIcon />),
        item("/tags", "tags", <LocalOfferIcon />),
        ...(administrador && showCampaigns
          ? [
              {
                chave: "mainDrawer.listItems.campaigns",
                icone: <EventAvailableIcon />,
                filhos: [
                  {
                    to: "/campaigns",
                    chave: "redesign.envios",
                    icone: <ListIcon />
                  },
                  {
                    to: "/contact-lists",
                    chave: "redesign.listasContatos",
                    icone: <PeopleIcon />
                  },
                  {
                    to: "/campaigns-config",
                    chave: "mainDrawer.listItems.settings",
                    icone: <SettingsOutlinedIcon />
                  }
                ]
              }
            ]
          : []),
        item("/schedules", "schedules", <EventIcon />)
      ]
    },
    {
      chave: "redesign.automacao",
      itens: [
        ...(administrador
          ? [
              item("/queues", "queues", <AccountTreeOutlinedIcon />),
              item("/chatgpt", "chatgpt", <ChatOutlinedIcon />)
            ]
          : []),
        item("/quick-messages", "quickMessages", <FlashOnIcon />),
        ...(administrador
          ? [
              item(
                "/connections",
                "connections",
                <Badge badgeContent={connectionWarning ? "!" : 0} color="error">
                  <SyncAltIcon />
                </Badge>
              )
            ]
          : [])
      ]
    },
    {
      chave: "redesign.administracao",
      itens: [
        ...(administrador
          ? [
              item("/users", "users", <PeopleAltOutlinedIcon />),
              item("/announcements", "annoucements", <AnnouncementIcon />),
              item("/financeiro", "financeiro", <LocalAtmIcon />),
              item("/settings", "settings", <SettingsOutlinedIcon />)
            ]
          : []),
        item("/helps", "helps", <HelpOutlineIcon />)
      ]
    }
  ];
  return (
    <Navegacao grupos={grupos} expandido={drawerOpen} aoNavegar={drawerClose} />
  );
};

export default MainListItems;
