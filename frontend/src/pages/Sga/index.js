import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { useHistory, useLocation } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
  makeStyles
} from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";
import Autocomplete from "@material-ui/lab/Autocomplete";
import SyncIcon from "@material-ui/icons/Sync";
import DirectionsCarIcon from "@material-ui/icons/DirectionsCar";
import { toast } from "react-toastify";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import ContactModal from "../../components/ContactModal";
import ScheduleModal from "../../components/ScheduleModal";

// React escapes text nodes; escaping twice would display entities in dates/names.
const t = (key, args) =>
  i18n.t(`sga.${key}`, { ...args, interpolation: { escapeValue: false } });
const currency = value =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0)
  );
const date = value =>
  value
    ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(
        "pt-BR"
      )
    : "—";
const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(3),
    overflow: "auto",
    height: "100%",
    [theme.breakpoints.down("sm")]: { padding: theme.spacing(1.5) }
  },
  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24
  },
  stat: {
    padding: 20,
    height: "100%",
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`
  },
  filters: { padding: 16, marginTop: 24, marginBottom: 16, borderRadius: 12 },
  plate: {
    fontFamily: "monospace",
    fontWeight: 700,
    letterSpacing: 1,
    fontSize: 15
  },
  table: { minWidth: 850 },
  section: { marginTop: 24, marginBottom: 12 },
  badges: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
  alert: { marginBottom: 16 }
}));

export default function Sga() {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const admin = user.profile === "admin";
  const location = useLocation();
  const history = useHistory();
  const contactId = new URLSearchParams(location.search).get("contactId") || "";
  const [state, setState] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "", debt: "", link: "" });
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [options, setOptions] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [saving, setSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [bill, setBill] = useState(null);
  const [billLoading, setBillLoading] = useState("");
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const { data } = await api.get("/sga/status");
      if (id !== requestId.current) return;
      setState(data);
      if (data.enabled && data.syncedAt) {
        const response = await api.get("/sga/vehicles", {
          params: { ...filters, search, page: page + 1, limit, contactId }
        });
        if (id === requestId.current) setResult(response.data);
      }
    } catch (error) {
      if (id === requestId.current) toastError(error);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [filters, search, page, limit, contactId]);
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(refresh, 300);
    const poll = setInterval(refresh, 15000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      ++requestId.current;
    };
  }, [refresh]);
  useEffect(() => {
    if (!detail || !admin) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      api
        .get("/contacts/selection", {
          params: { searchParam: contactSearch, pageNumber: 1 }
        })
        .then(({ data }) => {
          if (active) setOptions(data.contacts || []);
        })
        .catch(toastError);
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [contactSearch, detail, admin]);
  const openDetail = async id => {
    setDetailLoading(true);
    setSelectedContact(null);
    setContactSearch("");
    try {
      const { data } = await api.get(`/sga/vehicles/${id}`);
      setDetail(data);
    } catch (error) {
      toastError(error);
    } finally {
      setDetailLoading(false);
    }
  };
  const sync = async () => {
    setSaving(true);
    try {
      await api.post("/sga/sync");
      setState(current => ({ ...current, status: "syncing" }));
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };
  const saveLink = async id => {
    setSaving(true);
    try {
      await api.put(`/sga/members/${detail.vehicle.memberId}/contact`, {
        contactId: id
      });
      toast.success(t("linkSaved"));
      await openDetail(detail.vehicle.id);
      await refresh();
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };
  const getBill = async number => {
    setBillLoading(number);
    try {
      const { data } = await api.get(`/sga/bills/${number}`);
      setBill(data);
    } catch (error) {
      toastError(error);
    } finally {
      setBillLoading("");
    }
  };
  const member = detail?.vehicle.member;
  const updateFilter = (key, value) => {
    setPage(0);
    setFilters(current => ({ ...current, [key]: value }));
  };
  const summary = result?.summary;
  return (
    <div className={classes.root}>
      <div className={classes.heading}>
        <div>
          <Typography variant="h4">
            <DirectionsCarIcon /> {t("title")}
          </Typography>
          <Typography color="textSecondary">{t("subtitle")}</Typography>
        </div>
        {state?.enabled && admin && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<SyncIcon />}
            disabled={saving || state.status === "syncing" || !state.configured}
            onClick={sync}
          >
            {t(state.status === "syncing" ? "syncing" : "sync")}
          </Button>
        )}
      </div>
      {state && !state.enabled && (
        <Alert severity="info">{t("unavailable")}</Alert>
      )}
      {state?.enabled && !state.configured && (
        <Alert severity="warning">{t("notConfigured")}</Alert>
      )}
      {state?.error && (
        <Alert severity="warning" className={classes.alert}>
          {t("syncFailed")} {i18n.t(`backendErrors.${state.error}`)}
        </Alert>
      )}
      {state?.enabled && !state.syncedAt && (
        <Alert severity="info">
          {t(state.status === "syncing" ? "syncing" : "firstSync")}
        </Alert>
      )}
      {loading && !result && (
        <Box py={4} display="flex" justifyContent="center">
          <CircularProgress aria-label={t("loading")} />
        </Box>
      )}
      {summary && (
        <>
          <Grid container spacing={2}>
            {[
              "vehicles",
              "members",
              "linked",
              "overdueMembers",
              "overdueAmount",
              "overdueBills"
            ].map(key => (
              <Grid item xs={6} md={4} lg={2} key={key}>
                <Paper elevation={0} className={classes.stat}>
                  <Typography variant="body2" color="textSecondary">
                    {t(key)}
                  </Typography>
                  <Typography variant="h5">
                    {key === "overdueAmount"
                      ? currency(summary[key])
                      : summary[key].toLocaleString("pt-BR")}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
          <Box mt={2}>
            <Typography variant="body2" color="textSecondary">
              {t("syncedAt", {
                date: new Date(result.syncedAt).toLocaleString("pt-BR")
              })}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {t("automatic")}
            </Typography>
          </Box>
          {contactId && (
            <Alert
              severity="info"
              action={
                <Button size="small" onClick={() => history.replace("/sga")}>
                  {t("clearContactFilter")}
                </Button>
              }
            >
              {t("filteredContact")}
            </Alert>
          )}
          <Paper elevation={0} className={classes.filters}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  id="sga-search"
                  fullWidth
                  variant="outlined"
                  size="small"
                  label={t("search")}
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </Grid>
              {[
                ["status", result.statuses.map(s => [s, s])],
                [
                  "debt",
                  [
                    ["overdue", t("overdue")],
                    ["clear", t("clear")]
                  ]
                ],
                [
                  "link",
                  [
                    ["linked", t("linked")],
                    ["unmatched", t("unmatched")],
                    ["ambiguous", t("ambiguous")]
                  ]
                ]
              ].map(([key, opts]) => (
                <Grid item xs={12} md={4} key={key}>
                  <TextField
                    id={`sga-filter-${key}`}
                    fullWidth
                    select
                    variant="outlined"
                    size="small"
                    label={t(key)}
                    value={filters[key]}
                    onChange={e => updateFilter(key, e.target.value)}
                  >
                    <MenuItem value="">{t("all")}</MenuItem>
                    {opts.map(([value, label]) => (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              ))}
            </Grid>
          </Paper>
          <Paper variant="outlined">
            <TableContainer>
              <Table className={classes.table} size="small">
                <TableHead>
                  <TableRow>
                    {[
                      "plate",
                      "vehicle",
                      "member",
                      "contact",
                      "debt",
                      "details"
                    ].map(key => (
                      <TableCell key={key}>{t(key)}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.rows.map(row => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <span className={classes.plate}>
                          {row.plate || "—"}
                        </span>
                        <Typography variant="caption" display="block">
                          {row.status}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {row.brand}
                        <Typography variant="body2" color="textSecondary">
                          {row.model} • {row.year}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {row.member?.name || "—"}
                        <Typography variant="caption" display="block">
                          {row.member?.document}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {row.member?.contact?.name ||
                          t(
                            row.member?.match.method === "ambiguous"
                              ? "ambiguous"
                              : "unmatched"
                          )}
                        <Typography variant="caption" display="block">
                          {row.member?.contact?.number}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={
                            row.member?.overdueCount ? "secondary" : "default"
                          }
                          label={
                            row.member?.overdueCount
                              ? currency(row.member.overdueAmount)
                              : t("clear")
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          color="primary"
                          disabled={detailLoading}
                          onClick={() => openDetail(row.id)}
                        >
                          {t("details")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!result.rows.length && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        {t("noResults")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={result.total}
              page={page}
              onPageChange={(_event, value) => setPage(value)}
              rowsPerPage={limit}
              onRowsPerPageChange={e => {
                setLimit(Number(e.target.value));
                setPage(0);
              }}
              rowsPerPageOptions={[25, 50, 100]}
              labelRowsPerPage={t("perPage")}
              labelDisplayedRows={values => t("pageLabel", values)}
            />
          </Paper>
        </>
      )}
      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {detail?.vehicle.plate} • {detail?.vehicle.model}
        </DialogTitle>
        <DialogContent dividers>
          {detail && (
            <>
              <Typography variant="h6">{member?.name}</Typography>
              <Typography variant="body2">{t("source")}</Typography>
              <div className={classes.badges}>
                <Chip label={detail.vehicle.status} size="small" />
                <Chip
                  label={
                    member?.overdueCount
                      ? `${t("overdue")}: ${currency(member.overdueAmount)}`
                      : t("clear")
                  }
                  color={member?.overdueCount ? "secondary" : "default"}
                  size="small"
                />
              </div>
              <Grid container spacing={2} className={classes.section}>
                {[
                  ["document", member?.document],
                  ["phones", member?.phones.join(" / ")],
                  ["email", member?.email],
                  ["contract", date(detail.vehicle.contractDate)],
                  ["protectedValue", currency(detail.vehicle.protectedValue)]
                ].map(([key, value]) => (
                  <Grid item xs={12} sm={6} md={4} key={key}>
                    <Typography variant="caption" color="textSecondary">
                      {t(key)}
                    </Typography>
                    <Typography>{value || "—"}</Typography>
                  </Grid>
                ))}
              </Grid>
              <Typography variant="h6" className={classes.section}>
                {t("relation")}
              </Typography>
              {member?.contact ? (
                <Alert severity="success">
                  {member.contact.name} • {member.contact.number}
                  <br />
                  {t("automaticLink", {
                    method: t(`methods.${member.match.method}`)
                  })}
                </Alert>
              ) : (
                <Alert
                  severity={
                    member?.match.method === "ambiguous" ? "warning" : "info"
                  }
                >
                  {t(
                    member?.match.method === "ambiguous"
                      ? "ambiguity"
                      : "noLink"
                  )}
                </Alert>
              )}
              {admin && (
                <Box mt={2}>
                  <Autocomplete
                    options={options}
                    getOptionLabel={option =>
                      `${option.name} • ${option.number}`
                    }
                    getOptionSelected={(a, b) => a.id === b.id}
                    value={selectedContact}
                    onChange={(_event, value) => setSelectedContact(value)}
                    onInputChange={(_event, value) => setContactSearch(value)}
                    renderInput={params => (
                      <TextField
                        {...params}
                        variant="outlined"
                        size="small"
                        label={t("selectContact")}
                      />
                    )}
                  />
                  <Box mt={1}>
                    <Button
                      color="primary"
                      disabled={!selectedContact || saving}
                      onClick={() => saveLink(selectedContact.id)}
                    >
                      {t("saveLink")}
                    </Button>
                    {member?.contact && (
                      <Button disabled={saving} onClick={() => saveLink(null)}>
                        {t("removeLink")}
                      </Button>
                    )}
                  </Box>
                </Box>
              )}
              {member?.contact && (
                <Box mt={1}>
                  <Button color="primary" onClick={() => setContactOpen(true)}>
                    {t("editContact")}
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setScheduleOpen(true)}
                  >
                    {t("schedule")}
                  </Button>
                  <Typography variant="caption" display="block">
                    {t("scheduleHelp")}
                  </Typography>
                </Box>
              )}
              <Typography variant="h6" className={classes.section}>
                {t("otherVehicles")}
              </Typography>
              <div className={classes.badges}>
                {detail.relatedVehicles.map(v => (
                  <Chip
                    key={v.id}
                    label={`${v.plate || "—"} • ${v.model}`}
                    onClick={() => openDetail(v.id)}
                  />
                ))}
              </div>
              <Typography variant="h6" className={classes.section}>
                {t("bills")}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {t("billScope")}
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {[
                        "billNumber",
                        "due",
                        "amount",
                        "billStatus",
                        "billVehicles",
                        "getBill"
                      ].map(key => (
                        <TableCell key={key}>{t(key)}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.bills.map(b => (
                      <TableRow key={b.id}>
                        <TableCell>{b.number}</TableCell>
                        <TableCell>{date(b.due)}</TableCell>
                        <TableCell>{currency(b.amount)}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={t(b.overdue ? "overdueLabel" : "openLabel")}
                            color={b.overdue ? "secondary" : "default"}
                          />
                        </TableCell>
                        <TableCell>
                          {b.vehicleIds
                            .map(
                              id =>
                                detail.relatedVehicles.find(v => v.id === id)
                                  ?.plate || `#${id}`
                            )
                            .join(", ") || t("memberOnly")}
                        </TableCell>
                        <TableCell>
                          <Button
                            color="primary"
                            size="small"
                            disabled={!!billLoading}
                            onClick={() => getBill(b.number)}
                          >
                            {billLoading === b.number ? (
                              <CircularProgress size={18} />
                            ) : (
                              t("getBill")
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!detail.bills.length && (
                      <TableRow>
                        <TableCell colSpan={6}>{t("noBills")}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetail(null)}>{t("close")}</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!bill}
        onClose={() => setBill(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {t("getBill")} • {bill?.number}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {bill?.status} • {date(bill?.due)} • {currency(bill?.amount)}
          </Typography>
          <TextField
            fullWidth
            multiline
            margin="normal"
            label={t("paymentLine")}
            value={bill?.line || t("noPaymentLine")}
            InputProps={{ readOnly: true }}
          />
          {bill?.line && (
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(bill.line);
                  toast.success(t("copied"));
                } catch {
                  toast.error(t("requestFailed"));
                }
              }}
            >
              {t("copyLine")}
            </Button>
          )}
          {bill?.url && (
            <Button
              component="a"
              href={bill.url}
              target="_blank"
              rel="noopener noreferrer"
              color="primary"
            >
              {t("openBill")}
            </Button>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBill(null)}>{t("close")}</Button>
        </DialogActions>
      </Dialog>
      {member?.contact && (
        <>
          <ContactModal
            open={contactOpen}
            onClose={() => {
              setContactOpen(false);
              refresh();
            }}
            contactId={member.contact.id}
          />
          <ScheduleModal
            open={scheduleOpen}
            onClose={() => setScheduleOpen(false)}
            contactId={member.contact.id}
            initialBody={t("draft", {
              name: member.name,
              plate: detail.vehicle.plate
            })}
          />
        </>
      )}
    </div>
  );
}
