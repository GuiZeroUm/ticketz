import React, { useState } from "react";
import { Button, CircularProgress, Tooltip } from "@material-ui/core";
import DescriptionOutlinedIcon from "@material-ui/icons/DescriptionOutlined";
import HourglassEmptyIcon from "@material-ui/icons/HourglassEmpty";

import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import { baixarNotaFiscal } from "./notaFiscalApi";
import { estadoNota } from "./estadoNota";

// Fica ao lado do botão PAGO na tela de faturas do cliente. Só aparece quando
// existe nota emitida ou em emissão; nos outros casos não ocupa espaço.
const BotaoNotaCliente = ({ fatura }) => {
  const [baixando, setBaixando] = useState(false);
  const estado = estadoNota(fatura, { dadosFiscaisCompletos: true });

  if (estado === "emitida" && fatura.fiscalNote?.hasPdf !== false) {
    const numero = fatura.fiscalNote?.number;
    const handleBaixar = async () => {
      setBaixando(true);
      try {
        await baixarNotaFiscal("cliente", fatura.id, "pdf");
      } catch (err) {
        toastError(err);
      }
      setBaixando(false);
    };
    return (
      <Tooltip
        title={
          numero
            ? i18n.t("notaFiscal.numero", { numero })
            : i18n.t("notaFiscal.baixar")
        }
      >
        <Button
          size="small"
          variant="outlined"
          color="primary"
          onClick={handleBaixar}
          disabled={baixando}
          aria-label={i18n.t("notaFiscal.baixar")}
          startIcon={
            baixando ? (
              <CircularProgress size={14} />
            ) : (
              <DescriptionOutlinedIcon fontSize="small" />
            )
          }
        >
          {i18n.t("notaFiscal.botao")}
        </Button>
      </Tooltip>
    );
  }

  if (estado === "emEmissao") {
    return (
      <Tooltip title={i18n.t("notaFiscal.emEmissaoDica")}>
        {/* span: botão desabilitado não dispara o tooltip sozinho */}
        <span tabIndex={0} aria-label={i18n.t("notaFiscal.emEmissaoDica")}>
          <Button
            size="small"
            variant="outlined"
            disabled
            startIcon={<HourglassEmptyIcon fontSize="small" />}
          >
            {i18n.t("notaFiscal.emEmissao")}
          </Button>
        </span>
      </Tooltip>
    );
  }

  return null;
};

export default BotaoNotaCliente;
