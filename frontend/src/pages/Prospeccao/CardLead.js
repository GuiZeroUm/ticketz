import React from "react";

import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import FileCopyOutlinedIcon from "@material-ui/icons/FileCopyOutlined";
import InstagramIcon from "@material-ui/icons/Instagram";
import RoomOutlinedIcon from "@material-ui/icons/RoomOutlined";
import ErrorOutlineIcon from "@material-ui/icons/ErrorOutline";

import { linkWhatsapp, telefoneDoLead } from "../../helpers/prospeccao";

const useStyles = makeStyles(theme => ({
  card: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(1.5)
  },
  cabecalho: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing(1),
    flexWrap: "wrap"
  },
  nome: {
    fontWeight: 600
  },
  metadados: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(0.5),
    color: theme.palette.text.secondary
  },
  metadado: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    marginRight: theme.spacing(1.5),
    fontSize: "0.8125rem"
  },
  icone: {
    fontSize: "1rem"
  },
  bio: {
    marginTop: theme.spacing(1),
    fontStyle: "italic",
    color: theme.palette.text.secondary
  },
  rascunho: {
    marginTop: theme.spacing(1.5)
  },
  acoes: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1.5),
    flexWrap: "wrap"
  },
  falha: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
    color: theme.palette.error.main
  }
}));

const formataSeguidores = total => {
  if (!total && total !== 0) return null;
  if (total < 1000) return `${total} seguidores`;
  return `${(total / 1000).toFixed(total < 10000 ? 1 : 0)}k seguidores`;
};

const CardLead = ({ lead, rascunho, onRascunhoChange, onCopiar }) => {
  const classes = useStyles();

  const telefone = telefoneDoLead(lead);
  const seguidores = formataSeguidores(lead.instagramSeguidores);
  const link = linkWhatsapp(telefone, rascunho);
  const pendente = lead.status === "pendente";
  const falhou = lead.status === "falhou";

  return (
    <Paper className={classes.card} variant="outlined">
      <div className={classes.cabecalho}>
        <div>
          <Typography className={classes.nome}>
            {lead.nome || "Sem nome"}
          </Typography>
          <div className={classes.metadados}>
            {lead.categoria && (
              <span className={classes.metadado}>{lead.categoria}</span>
            )}
            {lead.endereco && (
              <span className={classes.metadado}>
                <RoomOutlinedIcon className={classes.icone} />
                {lead.endereco}
              </span>
            )}
            {lead.instagramHandle && (
              <span className={classes.metadado}>
                <InstagramIcon className={classes.icone} />@
                {lead.instagramHandle}
                {seguidores ? ` · ${seguidores}` : ""}
              </span>
            )}
          </div>
        </div>
        {pendente && <Chip size="small" label="Gerando rascunho..." />}
        {lead.idiomaSugerido && !pendente && (
          <Chip size="small" variant="outlined" label={lead.idiomaSugerido} />
        )}
      </div>

      {lead.instagramBio && (
        <Typography variant="body2" className={classes.bio}>
          {lead.instagramBio}
        </Typography>
      )}

      {falhou && (
        <div className={classes.falha}>
          <ErrorOutlineIcon className={classes.icone} />
          <Typography variant="body2">
            Não deu pra gerar o rascunho
            {lead.erro ? `: ${lead.erro}` : "."} Dá pra abrir a conversa e
            escrever na mão.
          </Typography>
        </div>
      )}

      {!pendente && (
        <>
          <TextField
            className={classes.rascunho}
            label="Rascunho da mensagem"
            multiline
            minRows={3}
            fullWidth
            variant="outlined"
            value={rascunho}
            onChange={event => onRascunhoChange(lead.id, event.target.value)}
            placeholder="Escreva a mensagem que você quer mandar"
          />

          <div className={classes.acoes}>
            <Tooltip
              title={
                telefone
                  ? ""
                  : "Esse lead não tem telefone nem WhatsApp no Instagram"
              }
            >
              {/* span porque o Tooltip não escuta eventos de botão desabilitado */}
              <span>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<WhatsAppIcon />}
                  disabled={!telefone}
                  href={link || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir no WhatsApp
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Copiar rascunho">
              <span>
                <IconButton
                  size="small"
                  disabled={!rascunho}
                  onClick={() => onCopiar(rascunho)}
                >
                  <FileCopyOutlinedIcon />
                </IconButton>
              </span>
            </Tooltip>
            {lead.telefone && (
              <Box component="span" color="text.secondary" fontSize="0.8125rem">
                {lead.telefone}
              </Box>
            )}
          </div>
        </>
      )}
    </Paper>
  );
};

export default CardLead;
