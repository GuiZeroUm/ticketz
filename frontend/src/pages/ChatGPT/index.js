import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import FileCopyOutlinedIcon from "@material-ui/icons/FileCopyOutlined";
import LinkOffOutlinedIcon from "@material-ui/icons/LinkOffOutlined";
import { toast } from "react-toastify";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  root: { flex: 1 },
  content: { padding: theme.spacing(2), overflowY: "auto" },
  card: { padding: theme.spacing(3), height: "100%" },
  warning: {
    padding: theme.spacing(2),
    borderLeft: `4px solid ${theme.palette.warning.main}`,
    background: theme.palette.type === "dark" ? "#3b2f1d" : "#fff8e1"
  },
  urlRow: { display: "flex", gap: theme.spacing(1), alignItems: "center" },
  grow: { flex: 1 },
  status: { marginLeft: theme.spacing(1) },
  table: { marginTop: theme.spacing(2) }
}));

const formatDate = value =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "short",
        timeStyle: "short"
      }).format(new Date(value))
    : "—";

const ChatGPT = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/chatgpt/integration");
      setData(response.data);
    } catch (error) {
      toastError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (user?.profile !== "admin") return null;

  const copyUrl = async () => {
    await navigator.clipboard.writeText(data.mcpUrl);
    toast.success(i18n.t("chatgpt.toasts.copied"));
  };

  const revoke = async () => {
    try {
      if (confirm === "all") await api.delete("/chatgpt/integration/grants");
      else await api.delete(`/chatgpt/integration/grants/${confirm}`);
      toast.success(i18n.t("chatgpt.toasts.revoked"));
      setConfirm(null);
      load();
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <MainContainer className={classes.root}>
      <ConfirmationModal
        open={Boolean(confirm)}
        title={i18n.t("chatgpt.revoke.title")}
        onClose={() => setConfirm(null)}
        onConfirm={revoke}
      >
        {i18n.t(
          confirm === "all" ? "chatgpt.revoke.all" : "chatgpt.revoke.one"
        )}
      </ConfirmationModal>
      <MainHeader>
        <Title>
          {i18n.t("chatgpt.title")}
          {data && (
            <Chip
              className={classes.status}
              size="small"
              color={data.enabled ? "primary" : "default"}
              label={i18n.t(
                data.enabled ? "chatgpt.enabled" : "chatgpt.disabled"
              )}
            />
          )}
        </Title>
      </MainHeader>
      <Paper className={classes.content}>
        {loading || !data ? (
          <Box display="flex" justifyContent="center" p={5}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Box className={classes.warning}>
                <Typography variant="subtitle1">
                  <strong>{i18n.t("chatgpt.warningTitle")}</strong>
                </Typography>
                <Typography variant="body2">
                  {i18n.t("chatgpt.warning")}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={7}>
              <Paper variant="outlined" className={classes.card}>
                <Typography variant="h6">
                  {i18n.t("chatgpt.connection.title")}
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                  {i18n.t("chatgpt.connection.description")}
                </Typography>
                <div className={classes.urlRow}>
                  <TextField
                    className={classes.grow}
                    variant="outlined"
                    size="small"
                    value={data.mcpUrl}
                    InputProps={{ readOnly: true }}
                  />
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<FileCopyOutlinedIcon />}
                    onClick={copyUrl}
                  >
                    {i18n.t("chatgpt.copy")}
                  </Button>
                </div>
                <Box mt={2}>
                  {data.scopes.map(scope => (
                    <Chip
                      key={scope}
                      label={scope}
                      size="small"
                      style={{ marginRight: 8 }}
                    />
                  ))}
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper variant="outlined" className={classes.card}>
                <Typography variant="h6">
                  {i18n.t("chatgpt.steps.title")}
                </Typography>
                <Stepper
                  activeStep={data.enabled ? 0 : -1}
                  orientation="vertical"
                >
                  {["open", "create", "url", "oauth", "login"].map(step => (
                    <Step key={step}>
                      <StepLabel>{i18n.t(`chatgpt.steps.${step}`)}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </Paper>
            </Grid>
            <Grid item xs={12}>
              <Paper variant="outlined" className={classes.card}>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography variant="h6">
                    {i18n.t("chatgpt.connections.title")}
                  </Typography>
                  {data.grants.length > 0 && (
                    <Button
                      color="secondary"
                      startIcon={<LinkOffOutlinedIcon />}
                      onClick={() => setConfirm("all")}
                    >
                      {i18n.t("chatgpt.connections.revokeAll")}
                    </Button>
                  )}
                </Box>
                {data.grants.length === 0 ? (
                  <Typography color="textSecondary" paragraph>
                    {i18n.t("chatgpt.connections.empty")}
                  </Typography>
                ) : (
                  <Table className={classes.table} size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          {i18n.t("chatgpt.connections.client")}
                        </TableCell>
                        <TableCell>
                          {i18n.t("chatgpt.connections.admin")}
                        </TableCell>
                        <TableCell>
                          {i18n.t("chatgpt.connections.created")}
                        </TableCell>
                        <TableCell>
                          {i18n.t("chatgpt.connections.lastUse")}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.grants.map(grant => (
                        <TableRow key={grant.id}>
                          <TableCell>{grant.client}</TableCell>
                          <TableCell>
                            {grant.administrator?.name}
                            <br />
                            <small>{grant.administrator?.email}</small>
                          </TableCell>
                          <TableCell>{formatDate(grant.createdAt)}</TableCell>
                          <TableCell>{formatDate(grant.lastUsedAt)}</TableCell>
                          <TableCell align="right">
                            <Button
                              color="secondary"
                              onClick={() => setConfirm(grant.id)}
                            >
                              {i18n.t("chatgpt.connections.revoke")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Paper>
            </Grid>
          </Grid>
        )}
      </Paper>
    </MainContainer>
  );
};

export default ChatGPT;
