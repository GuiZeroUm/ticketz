import React, { useState } from "react";
import {
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListSubheader,
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
import EditOutlinedIcon from "@material-ui/icons/EditOutlined";

import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import { i18nToast } from "../../helpers/i18nToast";
import { baixarNotaFiscal } from "./notaFiscalApi";
import { estadoNota } from "./estadoNota";
import DialogoEmitirNota from "./DialogoEmitirNota";
import DialogoCancelarNota from "./DialogoCancelarNota";
import DialogoCorrigirNota from "./DialogoCorrigirNota";
import DialogoDadosFiscais from "./DialogoDadosFiscais";
import { textoTomador, textoCancelamento } from "./textosNota";

const useStyles = makeStyles(theme => ({
  grupo: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    verticalAlign: "middle"
  },
  aviso: { color: theme.palette.warning?.main || "#f2994a" },
  erro: { color: theme.palette.error.main },
  emitir: { whiteSpace: "nowrap", textTransform: "none" },
  tomador: {
    whiteSpace: "normal",
    lineHeight: 1.4,
    maxWidth: 320,
    paddingTop: 6,
    paddingBottom: 6
  }
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
  // Cancelar e corrigir nota é só do super admin da plataforma (o backend
  // repete a regra).
  podeCancelar = false,
  aoDadosSalvos
}) => {
  const classes = useStyles();
  const [menuAncora, setMenuAncora] = useState(null);
  const [emitindo, setEmitindo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  // Corrigir nota: null → "dados" (formulário) → "confirmar" (motivo).
  const [etapaCorrecao, setEtapaCorrecao] = useState(null);
  const nota = fatura.fiscalNote;
  // Logo após a baixa a nota ainda está sendo criada no servidor: não oferecer
  // "Emitir" nesse intervalo (evita o 409 de nota duplicada).
  const estadoBase = estadoNota(fatura, { dadosFiscaisCompletos });
  const estado =
    aguardandoNota && !nota && estadoBase === "emitir"
      ? "preparando"
      : estadoBase;
  const tentativa = estado === "erro";
  const novaNota = estado === "cancelada";
  const tomador = textoTomador(nota?.tomador);
  const avisoCancelamento =
    estado === "emitida" ? textoCancelamento(nota?.cancelStatusDetail) : null;

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
    const titulo = [
      nota?.number
        ? `${i18n.t("notaFiscal.numero", { numero: nota.number })} — ${i18n.t(
            "notaFiscal.baixar"
          )}`
        : i18n.t("notaFiscal.baixar"),
      nota?.replacesNumber &&
        i18n.t("notaFiscal.substitui", { numero: nota.replacesNumber }),
      tomador
    ]
      .filter(Boolean)
      .join("\n");
    conteudo = (
      <>
        {avisoCancelamento && (
          <Tooltip title={avisoCancelamento}>
            <span
              tabIndex={0}
              role="img"
              aria-label={avisoCancelamento}
              className={classes.aviso}
            >
              <ReportProblemOutlinedIcon fontSize="small" />
            </span>
          </Tooltip>
        )}
        <Tooltip
          title={<span style={{ whiteSpace: "pre-line" }}>{titulo}</span>}
        >
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
          {tomador && (
            <ListSubheader className={classes.tomador} disableSticky>
              {tomador}
            </ListSubheader>
          )}
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
                setEtapaCorrecao("dados");
              }}
            >
              <ListItemIcon>
                <EditOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {i18n.t("notaFiscal.corrigir")}
            </MenuItem>
          )}
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
    [
      "emEmissao",
      "cancelando",
      "preparando",
      "corrigindo",
      "reemitindo"
    ].includes(estado)
  ) {
    const substitui =
      estado === "emEmissao" && nota?.replacesNumber
        ? nota.replacesNumber
        : null;
    const titulo = substitui
      ? i18n.t("notaFiscal.reemitindoDe", { numero: substitui })
      : i18n.t(
          {
            emEmissao: "notaFiscal.emEmissao",
            cancelando: "notaFiscal.cancelando",
            preparando: "notaFiscal.preparando",
            corrigindo: "notaFiscal.corrigindo",
            reemitindo: "notaFiscal.reemitindo"
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
      <>
        <Desabilitado titulo={i18n.t("notaFiscal.cancelada")}>
          <IconButton size="small" disabled>
            <BlockIcon fontSize="small" />
          </IconButton>
        </Desabilitado>
        <Button
          size="small"
          variant="outlined"
          color="primary"
          className={classes.emitir}
          startIcon={<NoteAddOutlinedIcon fontSize="small" />}
          onClick={() => setEmitindo(true)}
          aria-label={i18n.t("notaFiscal.emitirNovaDe", { id: fatura.id })}
        >
          {i18n.t("notaFiscal.emitirNova")}
        </Button>
      </>
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
      {(estado === "emitir" || tentativa || novaNota) && (
        <DialogoEmitirNota
          aberto={emitindo}
          fatura={fatura}
          titulo={
            tentativa
              ? i18n.t("notaFiscal.dialogo.tentarTitulo", { id: fatura.id })
              : novaNota
                ? i18n.t("notaFiscal.emitirNovaDe", { id: fatura.id })
                : undefined
          }
          rotuloConfirmar={
            tentativa
              ? i18n.t("notaFiscal.tentarDeNovo")
              : novaNota
                ? i18n.t("notaFiscal.emitirNova")
                : undefined
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
        <>
          <DialogoDadosFiscais
            aberto={etapaCorrecao === "dados"}
            companyId={fatura.companyId || fatura.company?.id}
            nome={fatura.company?.name}
            rotuloSalvar={i18n.t("notaFiscal.dialogo.salvarEContinuar")}
            aoSalvo={dados => {
              setEtapaCorrecao("confirmar");
              aoDadosSalvos && aoDadosSalvos(dados);
            }}
            // Depois de salvar o formulário fecha sozinho: mantém "confirmar".
            aoFechar={() =>
              setEtapaCorrecao(atual => (atual === "dados" ? null : atual))
            }
          />
          <DialogoCorrigirNota
            aberto={etapaCorrecao === "confirmar"}
            fatura={fatura}
            aoFechar={() => setEtapaCorrecao(null)}
            aoEnviado={atualizada => {
              i18nToast.success("notaFiscal.corrigirEnviado");
              aoAtualizar(atualizada);
            }}
          />
        </>
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
