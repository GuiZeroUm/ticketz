import React, { useEffect, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField
} from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";

import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import { corrigirNotaFiscal } from "./notaFiscalApi";
import { MOTIVO_MAX, MOTIVO_MIN } from "./DialogoCancelarNota";

// Confirma a correção: cancela a nota emitida e reemite com os dados atuais.
const DialogoCorrigirNota = ({ aberto, fatura, aoFechar, aoEnviado }) => {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const numero = fatura?.fiscalNote?.number;

  useEffect(() => {
    if (aberto) setMotivo(i18n.t("notaFiscal.dialogo.corrigirMotivoPadrao"));
  }, [aberto]);

  const tamanho = motivo.trim().length;
  const valido = tamanho >= MOTIVO_MIN && tamanho <= MOTIVO_MAX;

  const handleConfirmar = async () => {
    setEnviando(true);
    try {
      const nota = await corrigirNotaFiscal(fatura.id, motivo.trim());
      aoEnviado(nota);
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
      aria-labelledby="dialogo-corrigir-nota-titulo"
    >
      <DialogTitle id="dialogo-corrigir-nota-titulo">
        {i18n.t("notaFiscal.dialogo.corrigirTitulo")}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {numero
            ? i18n.t("notaFiscal.dialogo.corrigirPergunta", { numero })
            : i18n.t("notaFiscal.dialogo.corrigirPerguntaSemNumero")}
        </DialogContentText>
        <Alert severity="warning">
          {i18n.t("notaFiscal.dialogo.corrigirAviso")}
        </Alert>
        <TextField
          id="motivo-corrigir-nota"
          fullWidth
          multiline
          minRows={2}
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
          onClick={handleConfirmar}
          disabled={!valido || enviando}
          startIcon={enviando ? <CircularProgress size={14} /> : null}
        >
          {i18n.t("notaFiscal.dialogo.corrigirConfirmar")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DialogoCorrigirNota;
