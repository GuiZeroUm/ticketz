import React, {
  useState,
  useEffect,
  useReducer,
  useContext,
  useCallback
} from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import SubscriptionModal from "../../components/SubscriptionModal";
import api from "../../services/api";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import { safeValueFormat } from "../../helpers/safeValueFormat";
import toastError from "../../errors/toastError";

import moment from "moment";
import { Box, Chip, Typography } from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";
import AccountBalanceOutlinedIcon from "@material-ui/icons/AccountBalanceOutlined";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import BotaoNotaCliente from "../../components/NotaFiscal/BotaoNotaCliente";
import DialogoDadosFiscais from "../../components/NotaFiscal/DialogoDadosFiscais";
import useAtualizacaoNotas from "../../components/NotaFiscal/useAtualizacaoNotas";
import { carregarDadosFiscais } from "../../components/NotaFiscal/notaFiscalApi";

const reducer = (state, action) => {
  if (action.type === "LOAD_INVOICES") {
    const invoices = action.payload;
    const newUsers = [];

    invoices.forEach(user => {
      const userIndex = state.findIndex(u => u.id === user.id);
      if (userIndex !== -1) {
        state[userIndex] = user;
      } else {
        newUsers.push(user);
      }
    });

    return [...state, ...newUsers];
  }

  if (action.type === "UPDATE_USERS") {
    const user = action.payload;
    const userIndex = state.findIndex(u => u.id === user.id);

    if (userIndex !== -1) {
      state[userIndex] = user;
      return [...state];
    } else {
      return [user, ...state];
    }
  }

  if (action.type === "DELETE_USER") {
    const userId = action.payload;

    const userIndex = state.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      state.splice(userIndex, 1);
    }
    return [...state];
  }

  if (action.type === "UPDATE_FISCAL_NOTE") {
    const { invoiceId, fiscalNote } = action.payload;
    return state.map(invoice =>
      invoice.id === invoiceId ? { ...invoice, fiscalNote } : invoice
    );
  }

  if (action.type === "RESET") {
    return [];
  }
};

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles
  },
  cartoes: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1)
  },
  cartao: {
    padding: theme.spacing(1.5),
    display: "grid",
    gridTemplateColumns: "1fr auto",
    rowGap: theme.spacing(0.5),
    columnGap: theme.spacing(1),
    alignItems: "center"
  },
  cartaoVencido: { backgroundColor: "#ffbcbc9c" },
  cartaoAcoes: {
    gridColumn: "1 / -1",
    display: "flex",
    gap: theme.spacing(1),
    flexWrap: "wrap",
    marginTop: theme.spacing(0.5)
  },
  acoes: {
    display: "flex",
    gap: theme.spacing(1),
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap"
  }
}));

const Invoices = () => {
  const classes = useStyles();

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchParam] = useState("");
  const [invoices, dispatch] = useReducer(reducer, []);
  const [storagePlans, setStoragePlans] = React.useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const { user } = useContext(AuthContext);
  const theme = useTheme();
  const celular = useMediaQuery(theme.breakpoints.down("xs"));
  const podeEditarDadosFiscais = user?.profile === "admin" || !!user?.super;
  const [dadosFiscaisAbertos, setDadosFiscaisAbertos] = useState(false);
  const [dadosFiscaisCompletos, setDadosFiscaisCompletos] = useState(null);

  useEffect(() => {
    if (!podeEditarDadosFiscais) return;
    carregarDadosFiscais()
      .then(dados => setDadosFiscaisCompletos(!!dados?.complete))
      .catch(err => {
        if (err?.response?.status === 404) setDadosFiscaisCompletos(false);
      });
  }, [podeEditarDadosFiscais]);

  const recarregarFaturas = useCallback(async () => {
    try {
      const { data } = await api.get("/invoices/all", {
        params: { searchParam, pageNumber: 1 }
      });
      dispatch({ type: "LOAD_INVOICES", payload: data });
    } catch (err) {
      // a atualização automática não incomoda com aviso de erro
    }
  }, [searchParam]);

  useAtualizacaoNotas({
    faturas: invoices,
    recarregar: recarregarFaturas,
    aoAtualizarNota: (invoiceId, fiscalNote) =>
      dispatch({
        type: "UPDATE_FISCAL_NOTE",
        payload: { invoiceId, fiscalNote }
      })
  });

  const handleOpenContactModal = invoices => {
    setStoragePlans(invoices);
    setSelectedContactId(null);
    setContactModalOpen(true);
  };

  const handleCloseContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(false);
  };
  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchInvoices = async () => {
        try {
          const { data } = await api.get("/invoices/all", {
            params: { searchParam, pageNumber }
          });
          dispatch({ type: "LOAD_INVOICES", payload: data });
          setHasMore(data.hasMore);
          setLoading(false);
        } catch (err) {
          toastError(err);
        }
      };
      fetchInvoices();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber]);

  const loadMore = () => {
    setPageNumber(prevState => prevState + 1);
  };

  const handleScroll = e => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };
  const rowStyle = record => {
    const hoje = moment(moment()).format("DD/MM/yyyy");
    const vencimento = moment(record.dueDate).format("DD/MM/yyyy");
    var diff = moment(vencimento, "DD/MM/yyyy").diff(
      moment(hoje, "DD/MM/yyyy")
    );
    var dias = moment.duration(diff).asDays();
    if (dias < 0 && record.status !== "paid") {
      return { backgroundColor: "#ffbcbc9c" };
    }
  };

  const rowStatus = record => {
    const hoje = moment(moment()).format("DD/MM/yyyy");
    const vencimento = moment(record.dueDate).format("DD/MM/yyyy");
    var diff = moment(vencimento, "DD/MM/yyyy").diff(
      moment(hoje, "DD/MM/yyyy")
    );
    var dias = moment.duration(diff).asDays();
    const status = record.status;
    if (status === "paid") {
      return "Pago";
    }
    if (dias < 0) {
      return "Vencido";
    } else {
      return "Em Aberto";
    }
  };

  const renderAcoes = invoice => (
    <>
      {rowStatus(invoice) !== "Pago" ? (
        <Button
          size="small"
          variant="outlined"
          color="secondary"
          onClick={() => handleOpenContactModal(invoice)}
        >
          PAGAR
        </Button>
      ) : (
        <Button size="small" variant="outlined">
          PAGO
        </Button>
      )}
      <BotaoNotaCliente fatura={invoice} />
    </>
  );

  return (
    <MainContainer className="sd-business sd-finance">
      <SubscriptionModal
        open={contactModalOpen}
        onClose={handleCloseContactModal}
        aria-labelledby="form-dialog-title"
        Invoice={storagePlans}
        contactId={selectedContactId}
      ></SubscriptionModal>
      <DialogoDadosFiscais
        aberto={dadosFiscaisAbertos}
        aoFechar={() => setDadosFiscaisAbertos(false)}
        aoSalvo={dados => setDadosFiscaisCompletos(!!dados?.complete)}
      />
      <MainHeader>
        <Title>Faturas</Title>
        {podeEditarDadosFiscais && (
          <MainHeaderButtonsWrapper>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<AccountBalanceOutlinedIcon />}
              onClick={() => setDadosFiscaisAbertos(true)}
            >
              {i18n.t("notaFiscal.dados.titulo")}
            </Button>
          </MainHeaderButtonsWrapper>
        )}
      </MainHeader>
      {podeEditarDadosFiscais && dadosFiscaisCompletos === false && (
        <Box mb={1}>
          <Alert
            severity="info"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => setDadosFiscaisAbertos(true)}
              >
                {i18n.t("notaFiscal.preencherDados")}
              </Button>
            }
          >
            {i18n.t("notaFiscal.dados.incompletos")}
          </Alert>
        </Box>
      )}
      <Paper
        className={classes.mainPaper}
        variant="outlined"
        onScroll={handleScroll}
      >
        {celular ? (
          <div className={classes.cartoes}>
            {invoices.map(invoice => (
              <Paper
                key={invoice.id}
                variant="outlined"
                className={`${classes.cartao} ${
                  rowStyle(invoice) ? classes.cartaoVencido : ""
                }`}
              >
                <Typography variant="subtitle2">
                  {invoice.detail}
                  <Typography
                    component="span"
                    variant="caption"
                    color="textSecondary"
                  >
                    {` #${invoice.id}`}
                  </Typography>
                </Typography>
                <Typography variant="subtitle2" align="right">
                  {safeValueFormat(invoice.value, invoice.currency)}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {moment(invoice.dueDate)
                    .locale(navigator.language)
                    .format("L")}
                </Typography>
                <Typography variant="body2" align="right">
                  <strong>{rowStatus(invoice)}</strong>
                </Typography>
                <div className={classes.cartaoAcoes}>
                  {renderAcoes(invoice)}
                </div>
              </Paper>
            ))}
          </div>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="center">Id</TableCell>
                <TableCell align="center">Detalhes</TableCell>
                <TableCell align="center">Valor</TableCell>
                <TableCell align="center">Data Venc.</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Ação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <>
                {invoices.map(invoices => (
                  <TableRow style={rowStyle(invoices)} key={invoices.id}>
                    <TableCell align="center">{invoices.id}</TableCell>
                    <TableCell align="center">
                      {invoices.detail}
                      {invoices.billingType === "initial_prorata" && (
                        <>
                          <Chip
                            size="small"
                            color="primary"
                            label={i18n.t("billing.prorata")}
                            style={{ marginLeft: 8 }}
                          />
                          {invoices.periodStart && invoices.periodEnd && (
                            <Typography variant="caption" display="block">
                              {i18n.t("billing.period", {
                                start: moment(invoices.periodStart).format("L"),
                                end: moment(invoices.periodEnd)
                                  .subtract(1, "day")
                                  .format("L")
                              })}
                            </Typography>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell
                      className="sd-ledger-amount"
                      style={{ fontWeight: "bold" }}
                      align="center"
                    >
                      {safeValueFormat(invoices.value, invoices.currency)}
                    </TableCell>
                    <TableCell align="center">
                      {moment(invoices.dueDate)
                        .locale(navigator.language)
                        .format("L")}
                    </TableCell>
                    <TableCell style={{ fontWeight: "bold" }} align="center">
                      {rowStatus(invoices)}
                    </TableCell>
                    <TableCell align="center">
                      <div className={classes.acoes}>
                        {renderAcoes(invoices)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {loading && <TableRowSkeleton columns={4} />}
              </>
            </TableBody>
          </Table>
        )}
      </Paper>
    </MainContainer>
  );
};

export default Invoices;
