import React, { useEffect, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField
} from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";

import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import { cancelarNotaFiscal } from "./notaFiscalApi";

export const MOTIVO_MIN = 15;
export const MOTIVO_MAX = 255;

const DialogoCancelarNota = ({ aberto, fatura, aoFechar, aoCancelado }) => {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (aberto) setMotivo("");
  }, [aberto]);

  const tamanho = motivo.trim().length;
  const valido = tamanho >= MOTIVO_MIN && tamanho <= MOTIVO_MAX;

  const handleCancelar = async () => {
    setEnviando(true);
    try {
      const nota = await cancelarNotaFiscal(fatura.id, motivo.trim());
      aoCancelado(nota);
      aoFechar();
    } catch (err) {
      toastError(err);
    }
    setEnviando(false);
  };

  return (
    <Dialog
      open={!!aberto}
      onClose={enviando ? undefined : aoFechar}
      maxWidth="sm"
      fullWidth
      aria-labelledby="dialogo-cancelar-nota-titulo"
    >
      <DialogTitle id="dialogo-cancelar-nota-titulo">
        {i18n.t("notaFiscal.dialogo.cancelarTitulo")}
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning">
          {i18n.t("notaFiscal.dialogo.cancelarAviso")}
        </Alert>
        <TextField
          id="motivo-cancelamento-nota"
          autoFocus
          fullWidth
          multiline
          minRows={3}
          margin="normal"
          variant="outlined"
          label={i18n.t("notaFiscal.dialogo.motivoCancelamento")}
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          inputProps={{ maxLength: MOTIVO_MAX }}
          helperText={`${i18n.t("notaFiscal.dialogo.motivoAjuda")} ${tamanho}/${MOTIVO_MAX}`}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={aoFechar} disabled={enviando}>
          {i18n.t("notaFiscal.dialogo.voltar")}
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={handleCancelar}
          disabled={!valido || enviando}
          startIcon={enviando ? <CircularProgress size={14} /> : null}
        >
          {i18n.t("notaFiscal.dialogo.cancelarConfirmar")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DialogoCancelarNota;
