import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { useHistory } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  makeStyles
} from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const t = (key, args) =>
  i18n.t(`sga.billing.${key}`, {
    ...args,
    interpolation: { escapeValue: false }
  });
const stageName = offset => t(`stages.${offset}`);
const useStyles = makeStyles(theme => ({
  root: { padding: theme.spacing(3), overflow: "auto", height: "100%" },
  panel: {
    padding: theme.spacing(2.5),
    marginTop: theme.spacing(2),
    borderRadius: 12
  },
  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap"
  },
  message: {
    whiteSpace: "pre-wrap",
    padding: 20,
    borderRadius: 12,
    background: theme.palette.action.hover,
    lineHeight: 1.6
  },
  table: { minWidth: 700 },
  gap: { marginTop: 16 },
  steps: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }
}));
export default function SgaBilling() {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const admin = user?.profile === "admin";
  const [state, setState] = useState(null);
  const [config, setConfig] = useState(null);
  const [day, setDay] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [excludedInput, setExcludedInput] = useState("");
  const requestId = useRef(null);
  const dirty =
    !!state && JSON.stringify(config) !== JSON.stringify(state.config);
  const load = useCallback(async () => {
    if (!admin) return;
    setError(false);
    try {
      const { data } = await api.get("/sga/billing", {
        params: day ? { day } : undefined
      });
      setState(data);
      setConfig(data.config);
      setExcludedInput(data.config.excludedContactIds.join(","));
    } catch (e) {
      setError(true);
      toastError(e);
    }
  }, [admin, day]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPreview(null);
    setTestResult(null);
    requestId.current = null;
  }, [stepIndex]);
  const change = (key, value) => setConfig(c => ({ ...c, [key]: value }));
  const changeStep = (key, value) =>
    setConfig(c => ({
      ...c,
      steps: c.steps.map((s, i) =>
        i === stepIndex ? { ...s, [key]: value } : s
      )
    }));
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/sga/billing/config", config);
      await load();
      setPreview(null);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const showPreview = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(
        `/sga/billing/preview/${config.steps[stepIndex].offset}`
      );
      setPreview(data);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const runTest = async mode => {
    setBusy(true);
    // Retain this ID after network errors: retrying a click cannot duplicate a test.
    if (!requestId.current || requestId.current.mode !== mode)
      requestId.current = {
        mode,
        id: `test_${Date.now()}_${Math.random().toString(36).slice(2)}`
      };
    try {
      const { data } = await api.post("/sga/billing/test", {
        mode,
        stage: config.steps[stepIndex].offset,
        requestId: requestId.current.id
      });
      setPreview(data);
      setTestResult(data);
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const downloadPdf = async () => {
    try {
      const { data } = await api.get("/sga/billing/test.pdf", {
        responseType: "blob"
      });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "boleto-teste-sem-valor.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      toastError(e);
    }
  };
  if (!admin)
    return (
      <Box p={3}>
        <Alert severity="warning">{t("adminOnly")}</Alert>
      </Box>
    );
  if (error && !state)
    return (
      <Box p={3}>
        <Alert severity="error">{t("loadFailed")}</Alert>
        <Button onClick={load}>{t("refresh")}</Button>
      </Box>
    );
  if (!state || !config)
    return (
      <Box p={3}>
        <CircularProgress aria-label={t("loading")} />
      </Box>
    );
  const step = config.steps[stepIndex];
  const connected = state.connections.some(
    w => w.id === config.whatsappId && w.status === "CONNECTED"
  );
  return (
    <div className={classes.root}>
      <div className={classes.heading}>
        <div>
          <Typography variant="h4">{t("title")}</Typography>
          <Typography color="textSecondary">{t("subtitle")}</Typography>
        </div>
        <Button onClick={() => history.push("/sga")}>{t("back")}</Button>
      </div>
      <Box mt={2}>
        <Alert severity={state.liveAllowed ? "info" : "warning"}>
          {t(state.liveAllowed ? "liveReady" : "safeMode")}
        </Alert>
      </Box>
      {!state.fresh && (
        <Box mt={2}>
          <Alert severity="warning">{t("stale")}</Alert>
        </Box>
      )}
      <Paper className={classes.panel} elevation={0}>
        <Typography variant="h6">{t("settings")}</Typography>
        <FormControlLabel
          control={
            <Switch
              checked={config.enabled}
              onChange={e => change("enabled", e.target.checked)}
              disabled={!state.liveAllowed || busy}
              color="primary"
            />
          }
          label={t("enabled")}
        />
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField
              select
              fullWidth
              variant="outlined"
              label={t("connection")}
              id="billing-connection"
              value={config.whatsappId || ""}
              onChange={e =>
                change("whatsappId", Number(e.target.value) || null)
              }
            >
              <MenuItem value="">{t("selectConnection")}</MenuItem>
              {state.connections.map(w => (
                <MenuItem key={w.id} value={w.id}>
                  {w.name} · {w.status}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              fullWidth
              variant="outlined"
              type="number"
              label={t("startHour")}
              id="billing-start-hour"
              value={config.startHour}
              inputProps={{ min: 8, max: 17 }}
              onChange={e => change("startHour", Number(e.target.value))}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              fullWidth
              variant="outlined"
              type="number"
              label={t("endHour")}
              id="billing-end-hour"
              value={config.endHour}
              inputProps={{ min: 9, max: 18 }}
              onChange={e => change("endHour", Number(e.target.value))}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              fullWidth
              variant="outlined"
              type="number"
              label={t("dailyLimit")}
              id="billing-daily-limit"
              value={config.dailyLimit}
              inputProps={{ min: 1, max: 500 }}
              onChange={e => change("dailyLimit", Number(e.target.value))}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              fullWidth
              variant="outlined"
              select
              label={t("weekdays")}
              id="billing-weekdays"
              SelectProps={{ multiple: true }}
              value={config.weekdays}
              onChange={e => change("weekdays", e.target.value)}
            >
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <MenuItem key={d} value={d}>
                  {t(`days.${d}`)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="body2" color="textSecondary">
              {t("timingHelp")}
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              variant="outlined"
              label={t("excluded")}
              id="billing-excluded"
              helperText={t("excludedHelp")}
              value={excludedInput}
              onChange={e => {
                const raw = e.target.value;
                if (/^[\d,\s]*$/.test(raw)) {
                  setExcludedInput(raw);
                  change(
                    "excludedContactIds",
                    raw
                      .split(",")
                      .map(s => Number(s.trim()))
                      .filter(Boolean)
                  );
                }
              }}
            />
          </Grid>
        </Grid>
        <FormControlLabel
          control={
            <Switch
              checked={config.termsReviewed}
              onChange={e => change("termsReviewed", e.target.checked)}
              color="primary"
            />
          }
          label={t("termsReviewed")}
        />
        <Alert severity="info">{t("termsHelp")}</Alert>
      </Paper>
      <Paper className={classes.panel} elevation={0}>
        <Typography variant="h6" gutterBottom>
          {t("messages")}
        </Typography>
        <div className={classes.steps}>
          {config.steps.map((s, i) => (
            <Chip
              key={s.offset}
              label={stageName(s.offset)}
              color={i === stepIndex ? "primary" : "default"}
              onClick={() => setStepIndex(i)}
            />
          ))}
        </div>
        <FormControlLabel
          control={
            <Switch
              checked={step.enabled}
              onChange={e => changeStep("enabled", e.target.checked)}
              color="primary"
            />
          }
          label={t("stepEnabled")}
        />
        <Chip label={t(step.attachPdf ? "withPdf" : "textOnly")} />
        <TextField
          multiline
          minRows={7}
          variant="outlined"
          fullWidth
          label={stageName(step.offset)}
          id="billing-message"
          value={step.body}
          onChange={e => changeStep("body", e.target.value)}
          helperText={t("variables")}
          inputProps={{ maxLength: 3000 }}
        />
        <Box mt={2} display="flex" flexWrap="wrap" gridGap={12}>
          <Button
            color="primary"
            variant="contained"
            onClick={save}
            disabled={busy || !dirty}
          >
            {t("save")}
          </Button>
          <Button onClick={showPreview} disabled={busy || dirty}>
            {t("preview")}
          </Button>
          {dirty && (
            <Typography color="textSecondary">{t("unsaved")}</Typography>
          )}
        </Box>
        {preview && (
          <Box mt={2}>
            <Typography
              className={classes.message}
              data-testid="billing-preview"
            >
              {preview.body}
            </Typography>
            {preview.attachPdf && (
              <Button onClick={downloadPdf}>{t("downloadTestPdf")}</Button>
            )}
          </Box>
        )}
        <Box mt={2}>
          <Alert severity="info">
            {t("testHelp", { number: state.testNumber || t("notConfigured") })}
          </Alert>
        </Box>
        {!connected && (
          <Box mt={1}>
            <Alert severity="warning">{t("noConnection")}</Alert>
          </Box>
        )}
        <Box mt={2} display="flex" flexWrap="wrap" gridGap={12}>
          <Button
            variant="outlined"
            disabled={busy || dirty}
            onClick={() => runTest("simulation")}
          >
            {t("simulate")}
          </Button>
          <Button
            variant="outlined"
            disabled={busy || dirty || !connected || !state.testNumber}
            onClick={() => runTest("test")}
          >
            {t("sendTest")}
          </Button>
          <Button onClick={() => history.push("/connections")}>
            {t("connections")}
          </Button>
        </Box>
        {testResult && (
          <Box mt={2}>
            <Alert
              severity={
                testResult.status === "UNCERTAIN" ? "warning" : "success"
              }
            >
              {t(`result.${testResult.status}`)}
            </Alert>
          </Box>
        )}
      </Paper>
      <Paper className={classes.panel} elevation={0}>
        <div className={classes.heading}>
          <Typography variant="h6">{t("audience")}</Typography>
          <TextField
            type="date"
            label={t("date")}
            id="billing-preview-date"
            InputLabelProps={{ shrink: true }}
            value={day || state.day}
            disabled={dirty || busy}
            onChange={e => setDay(e.target.value)}
          />
          <Button onClick={load} disabled={dirty || busy}>
            {t("refresh")}
          </Button>
        </div>
        <Typography className={classes.gap}>
          {t("counts", state.counts)}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {t("previewHelp")}
        </Typography>
        <TableContainer>
          <Table size="small" className={classes.table}>
            <TableHead>
              <TableRow>
                {["member", "bill", "due", "amount", "stage", "status"].map(
                  k => (
                    <TableCell key={k}>{t(k)}</TableCell>
                  )
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {state.preview.map(r => (
                <TableRow key={`${r.billId}:${r.stage}`}>
                  <TableCell>
                    {r.member}
                    <Typography variant="caption" display="block">
                      {r.contact}
                    </Typography>
                  </TableCell>
                  <TableCell>{r.number}</TableCell>
                  <TableCell>{r.due}</TableCell>
                  <TableCell>
                    {Number(r.amount).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL"
                    })}
                  </TableCell>
                  <TableCell>{stageName(r.stage)}</TableCell>
                  <TableCell>
                    {r.reason
                      ? t(`reasons.${r.reason}`, { defaultValue: r.reason })
                      : t("eligible")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!state.preview.length && <Box p={2}>{t("empty")}</Box>}
      </Paper>
      <Paper className={classes.panel} elevation={0}>
        <Typography variant="h6">{t("history")}</Typography>
        <Typography variant="body2" color="textSecondary">
          {t("historyHelp")}
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {["date", "bill", "stage", "mode", "status"].map(k => (
                  <TableCell key={k}>{t(k)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {state.history.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    {new Date(r.createdAt).toLocaleString("pt-BR", {
                      timeZone: "America/Rio_Branco"
                    })}
                  </TableCell>
                  <TableCell>{r.billNumber}</TableCell>
                  <TableCell>{stageName(r.stage)}</TableCell>
                  <TableCell>{t(`modes.${r.mode}`)}</TableCell>
                  <TableCell>
                    {t(`reasons.${r.status}`, { defaultValue: r.status })}
                    {r.reason && (
                      <Typography variant="caption" display="block">
                        {t(`reasons.${r.reason}`, {
                          defaultValue: i18n.t(`backendErrors.${r.reason}`, {
                            defaultValue: r.reason
                          })
                        })}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </div>
  );
}
