import * as Abas from "@radix-ui/react-tabs";
import { Plus, Search, Archive, UsersRound } from "../AnimatedIcon";
import { Botao, BotaoIcone, useIdentidade } from "../interface";
import "../../pages/TicketsCustom/atendimento.css";
import "../TabelaDados/tabela.css";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { useHistory } from "react-router-dom";

import { makeStyles, alpha, useTheme } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";

import FormControlLabel from "@material-ui/core/FormControlLabel";
import Switch from "@material-ui/core/Switch";

import NewTicketModal from "../NewTicketModal";
import TicketsList from "../TicketsListCustom";
import TabPanel from "../TabPanel";

import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Can } from "../Can";
import TicketsQueueSelect from "../TicketsQueueSelect";
import { Box } from "@material-ui/core";
import { TagsFilter } from "../TagsFilter";
import { UsersFilter } from "../UsersFilter";
import useSettings from "../../hooks/useSettings";
import { ContactSelect } from "../ContactSelect";
import api from "../../services/api";
import { SocketContext } from "../../context/Socket/SocketContext";
import useEmailAvailability from "../../hooks/useEmailAvailability";
import useTicketChannelCounts, {
  formatChannelCount
} from "../../hooks/useTicketChannelCounts";
import { ChannelIcon, providerColors } from "../../helpers/emailConnections";
import { ti } from "../../helpers/emailInbox";
import {
  ALL_CONNECTIONS,
  connectionOptions,
  connectionParams
} from "../../helpers/inboxConnections";
import { canSeeScreen } from "../../helpers/screenAccess";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import useEmailAccounts from "../../hooks/useEmailAccounts";

const useStyles = makeStyles(theme => ({
  ticketsWrapper: {
    "& .MuiTab-wrapper": { flexDirection: "row", gap: 6 },
    "& .MuiTab-labelIcon": { minHeight: 44 },
    "& .MuiTab-labelIcon .MuiTab-wrapper > *:first-child": { marginBottom: 0 },
    position: "relative",
    display: "flex",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12
  },

  tabsHeader: {
    flex: "none"
    // backgroundColor: "#eee",
  },

  settingsIcon: {
    alignSelf: "center",
    marginLeft: "auto",
    padding: 8
  },

  tabWithGroups: {
    minWidth: 0,
    flex: 1,
    fontSize: 12,
    padding: "6px 8px"
  },

  tab: {
    minWidth: 0,
    flex: 1
  },

  ticketOptionsBox: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    // background: "#fafafa",
    padding: theme.spacing(1)
  },

  serachInputWrapper: {
    flex: 1,
    // background: "#fff",
    display: "flex",
    borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`,
    padding: 6,
    marginRight: theme.spacing(1)
  },

  searchIcon: {
    color: "grey",
    marginLeft: 6,
    marginRight: 6,
    alignSelf: "center"
  },

  searchInput: {
    flex: 1,
    border: "none",
    borderRadius: 8
  },

  badge: {
    right: "-10px"
  },
  show: {
    display: "block"
  },
  hide: {
    display: "none !important"
  },

  icon24: {
    width: 24,
    height: 24
  },

  channelFilter: {
    flex: "none",
    padding: "10px 10px 0"
  },

  channelFilterLabel: {
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: theme.palette.text.secondary,
    marginBottom: 6
  },

  channelChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5
  },

  channelChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 30,
    padding: "0 9px",
    borderRadius: 8,
    font: "inherit",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    background: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary
  },

  channelChipSelected: {
    fontWeight: 600,
    background: alpha(theme.palette.primary.main, 0.08),
    borderColor: theme.palette.primary.main,
    color: theme.palette.primary.main
  },

  channelChipCount: {
    fontSize: 11,
    fontWeight: 600,
    color: theme.palette.text.secondary
  },

  connectionFilter: {
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: 6,
    height: 32,
    margin: "6px 10px 0",
    padding: "0 10px",
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8,
    boxSizing: "border-box",
    color: theme.palette.text.secondary
  },

  connectionSelect: {
    flex: 1,
    minWidth: 0,
    border: 0,
    outline: "none",
    background: "transparent",
    font: "inherit",
    fontSize: 12.5,
    color: theme.palette.text.primary,
    cursor: "pointer",
    "& option": {
      background: theme.palette.background.paper,
      color: theme.palette.text.primary
    }
  },

  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)"
  }
}));

// Link icon of the design's "Filtrar por conexão" select.
const ConnectionIcon = () => (
  <svg
    aria-hidden="true"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: "none" }}
  >
    <path d="M9 17H7A5 5 0 0 1 7 7h2" />
    <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
    <path d="M8 12h8" />
  </svg>
);

const CHANNEL_FILTERS = [
  { key: "all", icon: "all" },
  { key: "whatsapp", icon: "wa" },
  { key: "email", icon: "mail" }
];

const TicketsManagerTabs = () => {
  const classes = useStyles();
  const theme = useTheme();
  const identidade = useIdentidade();
  const history = useHistory();

  const [searchParam, setSearchParam] = useState("");
  const [textoBusca, setTextoBusca] = useState("");
  const [tab, setTab] = useState("open");
  const [tabOpen, setTabOpen] = useState("open");
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const searchInputRef = useRef();
  const { user } = useContext(AuthContext);
  const { profile } = user;

  const [openCount, setOpenCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [groupUnreadCount, setGroupUnreadCount] = useState(0);
  const groupUnreadRequestRef = useRef(0);

  const userQueueIds = user.queues.map(q => q.id);
  const [availableQueues, setAvailableQueues] = useState(user.queues || []);
  const [selectedQueueIds, setSelectedQueueIds] = useState(userQueueIds || []);
  const [selectedContact, setSelectedContact] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);

  const { getSetting } = useSettings();
  const [showTabGroups, setShowTabGroups] = useState(false);
  const [groupMode, setGroupMode] = useState("conversation");
  const [groupTicketStatus, setGroupTicketStatus] = useState("pending");
  const socketManager = useContext(SocketContext);
  const { enabled: emailEnabled } = useEmailAvailability();
  const [channelFilter, setChannelFilter] = useState("all");
  const [connectionFilter, setConnectionFilter] = useState(ALL_CONNECTIONS);
  const { whatsApps } = useContext(WhatsAppsContext) || {};
  // GET /email/accounts is limited to admins and users who can see the
  // Connections screen; others filter by their WhatsApp connections only.
  const canListEmailAccounts =
    profile === "admin" || canSeeScreen(user, "connections");
  const { accounts: emailAccounts } = useEmailAccounts(
    emailEnabled && canListEmailAccounts
  );
  // Without the email channel the lists get no channel or connection filter
  // at all, so the inbox requests and behaves exactly as before.
  const channel =
    emailEnabled && channelFilter !== "all" ? channelFilter : undefined;
  const connectionChoices = connectionOptions({
    whatsApps,
    emailAccounts,
    channel: channelFilter
  });
  const connection =
    emailEnabled &&
    connectionChoices.some(option => option.value === connectionFilter)
      ? connectionParams(connectionFilter)
      : {};
  const { whatsappId, emailAccountId } = connection;
  const filtered = Boolean(channel || whatsappId || emailAccountId);
  const countStatus =
    tab === "open" && ["open", "pending"].includes(tabOpen) ? tabOpen : null;
  const channelCounts = useTicketChannelCounts({
    enabled: emailEnabled,
    status: countStatus,
    showAll: countStatus === "open" ? showAllTickets : undefined,
    queueIds: JSON.stringify(selectedQueueIds),
    userQueueIds: profile === "user" ? JSON.stringify(userQueueIds) : undefined,
    whatsappId,
    emailAccountId
  });

  useEffect(() => {
    if (!emailEnabled) {
      setChannelFilter("all");
      setConnectionFilter(ALL_CONNECTIONS);
    }
  }, [emailEnabled]);

  // As in the design: picking a channel starts over from every connection.
  const pickChannel = key => {
    setChannelFilter(key);
    setConnectionFilter(ALL_CONNECTIONS);
  };

  useEffect(() => {
    if (profile !== "admin") {
      setAvailableQueues(user.queues || []);
      setSelectedQueueIds(user.queues.map(queue => queue.id));
      return undefined;
    }

    let active = true;
    api
      .get("/queue")
      .then(({ data }) => {
        if (!active) return;
        const queues = Array.isArray(data) ? data : [];
        setAvailableQueues(queues);
        setSelectedQueueIds(current => {
          const assignedIds = new Set(user.queues.map(queue => queue.id));
          const hadEveryAssignedQueue =
            current.length === assignedIds.size &&
            current.every(queueId => assignedIds.has(queueId));
          return hadEveryAssignedQueue
            ? queues.map(queue => queue.id)
            : current.filter(queueId =>
                queues.some(queue => queue.id === queueId)
              );
        });
      })
      .catch(() => {
        // Assigned queues remain usable if the complete admin list cannot be
        // refreshed during a transient request failure.
      });

    return () => {
      active = false;
    };
  }, [profile, user.companyId, user.queues]);

  const refreshGroupUnreadCount = useCallback(async () => {
    const requestId = ++groupUnreadRequestRef.current;
    try {
      const { data } = await api.get("/whatsapp-groups/unread-count");
      if (requestId === groupUnreadRequestRef.current) {
        setGroupUnreadCount(Number(data.count) || 0);
      }
    } catch {
      // Preserve the last known count during a transient connection failure.
    }
  }, []);

  useEffect(() => {
    Promise.all([getSetting("CheckMsgIsGroup"), getSetting("groupsTab")]).then(
      ([ignoreGroups, groupsTab]) => {
        setShowTabGroups(
          user?.company?.whatsappMode !== "meta" &&
            ignoreGroups === "disabled" &&
            groupsTab === "enabled"
        );
      }
    );
  }, [user?.company?.whatsappMode]);

  useEffect(() => {
    if (!showTabGroups) {
      setGroupUnreadCount(0);
      return undefined;
    }

    refreshGroupUnreadCount();
    const companyId = localStorage.getItem("companyId");
    const socket = socketManager.GetSocket(companyId);
    const onConnect = () => socket.emit("joinNotification");
    const onMessage = data => {
      if (data.action === "create" && data.ticket?.isGroup) {
        refreshGroupUnreadCount();
      }
    };
    const onTicket = data => {
      if (
        data.action === "updateUnread" ||
        (data.action === "update" && data.ticket?.isGroup)
      ) {
        refreshGroupUnreadCount();
      }
    };
    const onRefresh = refreshRequired => {
      if (refreshRequired) refreshGroupUnreadCount();
    };

    socketManager.onConnect(onConnect);
    socket.on(`company-${companyId}-appMessage`, onMessage);
    socket.on(`company-${companyId}-ticket`, onTicket);
    socket.on("wsRefreshRequired", onRefresh);

    return () => socket.disconnect();
  }, [showTabGroups, socketManager, refreshGroupUnreadCount]);

  useEffect(() => {
    if (user.profile.toUpperCase() === "ADMIN") {
      setShowAllTickets(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "search") {
      searchInputRef.current.focus();
    } else {
      clearTimeout(searchTimeout.current);
      setTextoBusca("");
      setSearchParam("");
    }
  }, [tab]);

  const searchTimeout = useRef();
  useEffect(() => () => clearTimeout(searchTimeout.current), []);

  const handleSearch = e => {
    setTextoBusca(e.target.value);
    const searchedTerm = e.target.value.toLowerCase();

    clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(() => {
      setSearchParam(searchedTerm);
    }, 500);
  };

  const applyPanelStyle = status => {
    if (tabOpen !== status) {
      return { width: 0, height: 0 };
    }
  };

  const handleCloseOrOpenTicket = ticket => {
    setNewTicketModalOpen(false);
    if (ticket !== undefined && ticket.uuid !== undefined) {
      history.push(`/tickets/${ticket.uuid}`);
    }
  };

  const handleSelectedTags = selecteds => {
    const tags = selecteds.map(t => t.id);
    setSelectedTags(tags);
  };

  const handleSelectedUsers = selecteds => {
    const users = selecteds.map(t => t.id);
    setSelectedUsers(users);
  };

  return (
    <Paper
      elevation={0}
      variant="outlined"
      className={`${classes.ticketsWrapper} ew-ui fila-atendimento`}
      style={identidade}
    >
      <NewTicketModal
        modalOpen={newTicketModalOpen}
        onClose={ticket => {
          handleCloseOrOpenTicket(ticket);
        }}
      />
      <Abas.Root
        value={tab === "open" ? tabOpen : tab}
        onValueChange={valor => {
          setTab("open");
          setTabOpen(valor);
        }}
        className="fila-status"
      >
        <Abas.List className="ew-tabs" aria-label={i18n.t("visual.suporte")}>
          <Abas.Trigger value="open" className="ew-tab">
            {i18n.t("ticketsList.assignedHeader")}
            <span className="ew-badge">{openCount}</span>
          </Abas.Trigger>
          <Abas.Trigger value="pending" className="ew-tab">
            {i18n.t("ticketsList.pendingHeader")}
            <span className="ew-badge">{pendingCount}</span>
          </Abas.Trigger>
        </Abas.List>
      </Abas.Root>
      {emailEnabled && tab !== "groups" && (
        <div className={classes.channelFilter}>
          <div className={classes.channelFilterLabel} aria-hidden="true">
            {ti("filters.label")}
          </div>
          <div
            className={classes.channelChips}
            role="group"
            aria-label={ti("filters.groupLabel")}
          >
            {CHANNEL_FILTERS.map(filter => {
              const selected = channelFilter === filter.key;
              const iconColor = selected
                ? theme.palette.primary.main
                : filter.key === "whatsapp"
                  ? providerColors(theme, "wa").color
                  : theme.palette.text.secondary;
              const count = formatChannelCount(channelCounts?.[filter.key]);
              return (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={selected}
                  className={`${classes.channelChip} ${
                    selected ? classes.channelChipSelected : ""
                  }`}
                  onClick={() => pickChannel(filter.key)}
                >
                  <ChannelIcon
                    name={filter.icon}
                    size={14}
                    style={{ color: iconColor }}
                  />
                  {ti(`filters.${filter.key}`)}
                  {count && (
                    <span
                      className={classes.channelChipCount}
                      style={
                        selected
                          ? { color: theme.palette.primary.main }
                          : undefined
                      }
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="fila-pesquisa">
        <label className="tabela-busca">
          <Search size={15} />
          <input
            type="search"
            ref={searchInputRef}
            value={textoBusca}
            placeholder={i18n.t("visual.buscarAtendimentos")}
            aria-label={i18n.t("visual.buscarAtendimentos")}
            onChange={event => {
              setTab("search");
              handleSearch(event);
            }}
          />
        </label>
        <BotaoIcone
          titulo={i18n.t("ticketsManager.buttons.newTicket")}
          onClick={() => setNewTicketModalOpen(true)}
        >
          <Plus size={16} />
        </BotaoIcone>
      </div>
      {emailEnabled && tab !== "groups" && (
        <label className={classes.connectionFilter}>
          <span className={classes.srOnly}>{ti("filters.connection")}</span>
          <ConnectionIcon />
          <select
            className={classes.connectionSelect}
            value={
              whatsappId || emailAccountId ? connectionFilter : ALL_CONNECTIONS
            }
            onChange={event => setConnectionFilter(event.target.value)}
          >
            {connectionChoices.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="fila-atalhos">
        <Botao
          variante="ghost"
          className={tab === "closed" ? "is-active" : ""}
          onClick={() => setTab("closed")}
        >
          <Archive size={13} />
          {i18n.t("tickets.tabs.closed.title")}
        </Botao>
        <Botao
          variante="ghost"
          className={tab === "search" ? "is-active" : ""}
          onClick={() => setTab("search")}
        >
          <Search size={13} />
          {i18n.t("visual.filtrar")}
        </Botao>
        {showTabGroups && (
          <Botao
            variante="ghost"
            className={tab === "groups" ? "is-active" : ""}
            onClick={() => setTab("groups")}
          >
            <UsersRound size={13} />
            {i18n.t("tickets.tabs.groups.title")}
            {groupUnreadCount > 0 && (
              <span className="ew-badge">{groupUnreadCount}</span>
            )}
          </Botao>
        )}
      </div>
      <Paper
        square
        elevation={0}
        className={`${classes.ticketOptionsBox} fila-opcoes`}
      >
        {tab === "open" && (
          <Can
            role={user.profile}
            perform="tickets-manager:showall"
            yes={() => (
              <FormControlLabel
                label={i18n.t("tickets.buttons.showAll")}
                labelPlacement="start"
                control={
                  <Switch
                    size="small"
                    checked={showAllTickets}
                    onChange={() => setShowAllTickets(valor => !valor)}
                    name="showAllTickets"
                    color="primary"
                  />
                }
              />
            )}
          />
        )}
        <TicketsQueueSelect
          style={{ marginLeft: 6 }}
          selectedQueueIds={selectedQueueIds}
          userQueues={availableQueues}
          onChange={values => setSelectedQueueIds(values)}
        />
      </Paper>
      <TabPanel value={tab} name="open" className={classes.ticketsWrapper}>
        <Paper square elevation={0} className={classes.ticketsWrapper}>
          <TicketsList
            status="open"
            showAll={showAllTickets}
            selectedQueueIds={selectedQueueIds}
            channel={channel}
            whatsappId={whatsappId}
            emailAccountId={emailAccountId}
            filtered={filtered}
            updateCount={val => setOpenCount(val)}
            style={applyPanelStyle("open")}
            setTabOpen={setTabOpen}
            showTabGroups={showTabGroups}
          />
          <TicketsList
            status="pending"
            selectedQueueIds={selectedQueueIds}
            channel={channel}
            whatsappId={whatsappId}
            emailAccountId={emailAccountId}
            filtered={filtered}
            updateCount={val => setPendingCount(val)}
            style={applyPanelStyle("pending")}
            setTabOpen={setTabOpen}
            showTabGroups={showTabGroups}
          />
        </Paper>
      </TabPanel>
      <TabPanel value={tab} name="closed" className={classes.ticketsWrapper}>
        <TicketsList
          status="closed"
          showAll={true}
          selectedQueueIds={selectedQueueIds}
          channel={channel}
          whatsappId={whatsappId}
          emailAccountId={emailAccountId}
          filtered={filtered}
          showTabGroups={showTabGroups}
        />
      </TabPanel>
      <TabPanel value={tab} name="groups" className={classes.ticketsWrapper}>
        <Tabs
          value={groupMode}
          onChange={(_, value) => setGroupMode(value)}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab
            value="conversation"
            label={i18n.t("tickets.tabs.groups.conversations")}
          />
          <Tab
            value="ticket"
            label={i18n.t("tickets.tabs.groups.attendances")}
          />
        </Tabs>
        {groupMode === "conversation" ? (
          <TicketsList
            groups={true}
            groupMode="conversation"
            showAll={true}
            selectedQueueIds={selectedQueueIds}
            showTabGroups={showTabGroups}
          />
        ) : (
          <>
            <Tabs
              value={groupTicketStatus}
              onChange={(_, value) => setGroupTicketStatus(value)}
              indicatorColor="secondary"
              textColor="primary"
              variant="fullWidth"
            >
              <Tab
                value="pending"
                label={i18n.t("tickets.tabs.groups.pending")}
              />
              <Tab value="open" label={i18n.t("tickets.tabs.groups.open")} />
              <Tab
                value="closed"
                label={i18n.t("tickets.tabs.groups.closed")}
              />
            </Tabs>
            <TicketsList
              groups={true}
              groupMode="ticket"
              status={groupTicketStatus}
              showAll={true}
              selectedQueueIds={selectedQueueIds}
              showTabGroups={showTabGroups}
            />
          </>
        )}
      </TabPanel>
      <TabPanel value={tab} name="search" className={classes.ticketsWrapper}>
        <Box style={{ paddingRight: 10, paddingLeft: 10 }}>
          <ContactSelect
            onSelected={contactId => {
              setSelectedContact(contactId);
            }}
            allowCreate={false}
          />
        </Box>
        <TagsFilter onFiltered={handleSelectedTags} />
        {profile === "admin" && (
          <UsersFilter onFiltered={handleSelectedUsers} />
        )}
        <TicketsList
          isSearch={true}
          searchParam={searchParam}
          showAll={true}
          contactId={selectedContact}
          tags={selectedTags}
          users={selectedUsers}
          selectedQueueIds={selectedQueueIds}
          channel={channel}
          whatsappId={whatsappId}
          emailAccountId={emailAccountId}
          filtered={filtered}
          showTabGroups={showTabGroups}
        />
      </TabPanel>
    </Paper>
  );
};

export default TicketsManagerTabs;
