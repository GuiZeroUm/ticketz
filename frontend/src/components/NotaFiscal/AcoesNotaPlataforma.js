import React, { useState } from "react";
import {
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Tooltip
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import DescriptionOutlinedIcon from "@material-ui/icons/DescriptionOutlined";
import PictureAsPdfOutlinedIcon from "@material-ui/icons/PictureAsPdfOutlined";
import CodeIcon from "@material-ui/icons/Code";
import BlockIcon from "@material-ui/icons/Block";
import HourglassEmptyIcon from "@material-ui/icons/HourglassEmpty";
import ErrorOutlineIcon from "@material-ui/icons/ErrorOutline";
import ReplayIcon from "@material-ui/icons/Replay";
import ReportProblemOutlinedIcon from "@material-ui/icons/ReportProblemOutlined";
import NoteAddOutlinedIcon from "@material-ui/icons/NoteAddOutlined";

import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import { i18nToast } from "../../helpers/i18nToast";
import { baixarNotaFiscal } from "./notaFiscalApi";
import { estadoNota } from "./estadoNota";
import DialogoEmitirNota from "./DialogoEmitirNota";
import DialogoCancelarNota from "./DialogoCancelarNota";

const useStyles = makeStyles(theme => ({
  grupo: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    verticalAlign: "middle"
  },
  aviso: { color: theme.palette.warning?.main || "#f2994a" },
  erro: { color: theme.palette.error.main },
  emitir: { whiteSpace: "nowrap", textTransform: "none" }
}));

// Tooltip em elemento desabilitado precisa de um wrapper focável.
const Desabilitado = ({ titulo, children }) => (
  <Tooltip title={titulo}>
    <span tabIndex={0} aria-label={titulo} role="img">
      {children}
    </span>
  </Tooltip>
);

// Ações da nota fiscal na coluna "Ações" da Central de Cobrança (super).
const AcoesNotaPlataforma = ({
  fatura,
  dadosFiscaisCompletos,
  aoAtualizar,
  aoPreencherDados,
  aoRecarregar,
  aguardandoNota = false,
  // Cancelar nota é só do super admin da plataforma (o backend repete a regra).
  podeCancelar = false
}) => {
  const classes = useStyles();
  const [menuAncora, setMenuAncora] = useState(null);
  const [emitindo, setEmitindo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const nota = fatura.fiscalNote;
  // Logo após a baixa a nota ainda está sendo criada no servidor: não oferecer
  // "Emitir" nesse intervalo (evita o 409 de nota duplicada).
  const estadoBase = estadoNota(fatura, { dadosFiscaisCompletos });
  const estado =
    aguardandoNota && !nota && estadoBase === "emitir"
      ? "preparando"
      : estadoBase;
  const tentativa = estado === "erro";

  const baixar = async formato => {
    setMenuAncora(null);
    try {
      await baixarNotaFiscal("plataforma", fatura.id, formato, nota?.number);
    } catch (err) {
      toastError(err);
    }
  };

  let conteudo = null;

  if (estado === "emitida") {
    const titulo = nota?.number
      ? `${i18n.t("notaFiscal.numero", { numero: nota.number })} — ${i18n.t(
          "notaFiscal.baixar"
        )}`
      : i18n.t("notaFiscal.baixar");
    conteudo = (
      <>
        <Tooltip title={titulo}>
          <IconButton
            size="small"
            color="primary"
            aria-label={i18n.t("notaFiscal.baixar")}
            aria-haspopup="menu"
            onClick={e => setMenuAncora(e.currentTarget)}
          >
            <DescriptionOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={menuAncora}
          keepMounted={false}
          open={!!menuAncora}
          onClose={() => setMenuAncora(null)}
        >
          {nota?.hasPdf !== false && (
            <MenuItem onClick={() => baixar("pdf")}>
              <ListItemIcon>
                <PictureAsPdfOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {i18n.t("notaFiscal.baixarPdf")}
            </MenuItem>
          )}
          {nota?.hasXml && (
            <MenuItem onClick={() => baixar("xml")}>
              <ListItemIcon>
                <CodeIcon fontSize="small" />
              </ListItemIcon>
              {i18n.t("notaFiscal.baixarXml")}
            </MenuItem>
          )}
          {podeCancelar && <Divider />}
          {podeCancelar && (
            <MenuItem
              onClick={() => {
                setMenuAncora(null);
                setCancelando(true);
              }}
            >
              <ListItemIcon>
                <BlockIcon fontSize="small" />
              </ListItemIcon>
              {i18n.t("notaFiscal.cancelar")}
            </MenuItem>
          )}
        </Menu>
      </>
    );
  } else if (
    estado === "emEmissao" ||
    estado === "cancelando" ||
    estado === "preparando"
  ) {
    const titulo = i18n.t(
      {
        emEmissao: "notaFiscal.emEmissao",
        cancelando: "notaFiscal.cancelando",
        preparando: "notaFiscal.preparando"
      }[estado]
    );
    conteudo = (
      <Desabilitado titulo={titulo}>
        <IconButton size="small" disabled>
          <HourglassEmptyIcon fontSize="small" />
        </IconButton>
      </Desabilitado>
    );
  } else if (estado === "cancelada") {
    conteudo = (
      <Desabilitado titulo={i18n.t("notaFiscal.cancelada")}>
        <IconButton size="small" disabled>
          <BlockIcon fontSize="small" />
        </IconButton>
      </Desabilitado>
    );
  } else if (estado === "erro") {
    const detalhe = nota?.errorMessage || i18n.t("notaFiscal.erroSemDetalhe");
    const titulo = `${i18n.t("notaFiscal.erro")}: ${detalhe}`;
    conteudo = (
      <>
        <Tooltip title={titulo}>
          <span
            tabIndex={0}
            role="img"
            aria-label={titulo}
            className={classes.erro}
          >
            <ErrorOutlineIcon fontSize="small" />
          </span>
        </Tooltip>
        <Tooltip title={i18n.t("notaFiscal.tentarDeNovo")}>
          <span>
            <IconButton
              size="small"
              aria-label={i18n.t("notaFiscal.tentarDeNovo")}
              onClick={() => setEmitindo(true)}
            >
              <ReplayIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </>
    );
  } else if (estado === "faltamDados") {
    conteudo = (
      <Tooltip title={i18n.t("notaFiscal.faltamDadosAcao")}>
        <IconButton
          size="small"
          className={classes.aviso}
          aria-label={i18n.t("notaFiscal.preencherDados")}
          onClick={() => aoPreencherDados && aoPreencherDados(fatura)}
        >
          <ReportProblemOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  } else if (estado === "emitir") {
    conteudo = (
      <Button
        size="small"
        variant="outlined"
        color="primary"
        className={classes.emitir}
        startIcon={<NoteAddOutlinedIcon fontSize="small" />}
        onClick={() => setEmitindo(true)}
        aria-label={i18n.t("notaFiscal.emitirDe", { id: fatura.id })}
      >
        {i18n.t("notaFiscal.emitir")}
      </Button>
    );
  }

  if (!conteudo) return null;

  return (
    <span className={classes.grupo} data-estado-nota={estado}>
      {conteudo}
      {(estado === "emitir" || tentativa) && (
        <DialogoEmitirNota
          aberto={emitindo}
          fatura={fatura}
          titulo={
            tentativa
              ? i18n.t("notaFiscal.dialogo.tentarTitulo", { id: fatura.id })
              : undefined
          }
          rotuloConfirmar={
            tentativa ? i18n.t("notaFiscal.tentarDeNovo") : undefined
          }
          aoFechar={() => setEmitindo(false)}
          aoEmitido={novaNota => {
            i18nToast.success("notaFiscal.enviada");
            aoAtualizar(novaNota);
          }}
          aoPreencherDados={aoPreencherDados}
          aoRecarregar={aoRecarregar}
        />
      )}
      {estado === "emitida" && podeCancelar && (
        <DialogoCancelarNota
          aberto={cancelando}
          fatura={fatura}
          aoFechar={() => setCancelando(false)}
          aoCancelado={atualizada => {
            i18nToast.success("notaFiscal.cancelamentoEnviado");
            aoAtualizar(atualizada);
          }}
        />
      )}
    </span>
  );
};

export default AcoesNotaPlataforma;
