import React, { useEffect, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import Alert from "@material-ui/lab/Alert";

import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import { formatTaxId } from "../../utils/formatTaxId";
import { previaNotaFiscal, emitirNotaFiscal } from "./notaFiscalApi";
import { formatarCompetencia, formatarMoeda } from "./formatos";

const useStyles = makeStyles(theme => ({
  lista: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    columnGap: theme.spacing(2),
    rowGap: theme.spacing(1),
    margin: theme.spacing(2, 0, 0),
    "& dt": { color: theme.palette.text.secondary },
    "& dd": { margin: 0, fontWeight: 500, wordBreak: "break-word" },
    [theme.breakpoints.down("xs")]: {
      gridTemplateColumns: "1fr",
      rowGap: 2,
      "& dd": { marginBottom: theme.spacing(1) }
    }
  },
  carregando: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: theme.spacing(2, 0)
  }
}));

const DialogoEmitirNota = ({
  aberto,
  fatura,
  aoFechar,
  aoEmitido,
  aoPreencherDados,
  aoRecarregar,
  titulo,
  rotuloConfirmar
}) => {
  const classes = useStyles();
  const [previa, setPrevia] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [faltamDados, setFaltamDados] = useState(false);
  const [emitindo, setEmitindo] = useState(false);

  useEffect(() => {
    if (!aberto || !fatura) return undefined;
    let ativo = true;
    setPrevia(null);
    setFaltamDados(false);
    setCarregando(true);
    previaNotaFiscal(fatura.id)
      .then(dados => ativo && setPrevia(dados))
      .catch(err => {
        if (!ativo) return;
        if (err?.response?.data?.error === "ERR_FISCAL_DATA_INCOMPLETE") {
          setFaltamDados(true);
        } else {
          toastError(err);
        }
      })
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [aberto, fatura]);

  const handleEmitir = async () => {
    setEmitindo(true);
    try {
      const nota = await emitirNotaFiscal(fatura.id);
      aoEmitido(nota);
      aoFechar();
    } catch (err) {
      const codigo = err?.response?.data?.error;
      if (codigo === "ERR_FISCAL_DATA_INCOMPLETE") {
        setFaltamDados(true);
      } else {
        toastError(err);
        // A nota anterior saiu ou segue em andamento: mostra o estado atual.
        if (codigo === "ERR_FISCAL_NOTE_EXISTS") {
          aoRecarregar && aoRecarregar();
          aoFechar();
        }
      }
    }
    setEmitindo(false);
  };

  const tomador = previa?.tomador || {};

  return (
    <Dialog
      open={!!aberto}
      onClose={emitindo ? undefined : aoFechar}
      maxWidth="sm"
      fullWidth
      aria-labelledby="dialogo-emitir-nota-titulo"
    >
      <DialogTitle id="dialogo-emitir-nota-titulo">
        {titulo || i18n.t("notaFiscal.emitirDe", { id: fatura?.id })}
      </DialogTitle>
      <DialogContent>
        {carregando && (
          <div className={classes.carregando} role="status">
            <CircularProgress size={18} />
            <Typography variant="body2">
              {i18n.t("notaFiscal.dialogo.carregando")}
            </Typography>
          </div>
        )}

        {faltamDados && (
          <Alert
            severity="warning"
            action={
              aoPreencherDados && (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    aoFechar();
                    aoPreencherDados(fatura);
                  }}
                >
                  {i18n.t("notaFiscal.preencherDados")}
                </Button>
              )
            }
          >
            {i18n.t("backendErrors.ERR_FISCAL_DATA_INCOMPLETE")}
          </Alert>
        )}

        {previa && !faltamDados && (
          <>
            <Alert severity="info">{i18n.t("notaFiscal.dialogo.aviso")}</Alert>
            <dl className={classes.lista}>
              <dt>{i18n.t("notaFiscal.dialogo.tomador")}</dt>
              <dd>{tomador.name || "-"}</dd>
              <dt>{i18n.t("notaFiscal.dialogo.documento")}</dt>
              <dd>{tomador.document ? formatTaxId(tomador.document) : "-"}</dd>
              <dt>{i18n.t("notaFiscal.dialogo.email")}</dt>
              <dd>{tomador.email || "-"}</dd>
              <dt>{i18n.t("notaFiscal.dialogo.valor")}</dt>
              <dd>{formatarMoeda(previa.value, previa.currency)}</dd>
              <dt>{i18n.t("notaFiscal.dialogo.competencia")}</dt>
              <dd>{formatarCompetencia(previa.competencia)}</dd>
              {previa.service && (
                <>
                  <dt>{i18n.t("notaFiscal.dialogo.servico")}</dt>
                  <dd>
                    {[previa.service.code, previa.service.description]
                      .filter(Boolean)
                      .join(" — ")}
                  </dd>
                </>
              )}
              {previa.issRate !== undefined && previa.issRate !== null && (
                <>
                  <dt>{i18n.t("notaFiscal.dialogo.iss")}</dt>
                  <dd>{`${Number(previa.issRate).toLocaleString("pt-BR")}%`}</dd>
                </>
              )}
            </dl>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={aoFechar} disabled={emitindo}>
          {i18n.t("notaFiscal.dialogo.voltar")}
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleEmitir}
          disabled={!previa || faltamDados || emitindo}
          startIcon={emitindo ? <CircularProgress size={14} /> : null}
        >
          {rotuloConfirmar || i18n.t("notaFiscal.dialogo.confirmar")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DialogoEmitirNota;
