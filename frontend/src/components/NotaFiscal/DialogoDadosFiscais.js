import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  InputAdornment,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery
} from "@material-ui/core";
import { useTheme } from "@material-ui/core/styles";

import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import { i18nToast } from "../../helpers/i18nToast";
import { formatTaxId } from "../../utils/formatTaxId";
import {
  buscarCep,
  carregarDadosFiscais,
  salvarDadosFiscais
} from "./notaFiscalApi";
import {
  apenasDigitos,
  daApi,
  formatarCep,
  paraApi,
  UFS,
  validarDadosFiscais
} from "./validacao";

const VAZIO = daApi(null);

// Dados fiscais do tomador da nota. Sem companyId edita a própria empresa
// (admin); com companyId edita um cliente (Central de Cobrança, super).
const DialogoDadosFiscais = ({
  aberto,
  companyId,
  nome,
  aoFechar,
  aoSalvo
}) => {
  const theme = useTheme();
  const telaCheia = useMediaQuery(theme.breakpoints.down("xs"));
  const [form, setForm] = useState(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [tocados, setTocados] = useState({});
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [cepStatus, setCepStatus] = useState(null);
  const ultimoCep = useRef("");

  useEffect(() => {
    if (!aberto) return undefined;
    let ativo = true;
    setForm(VAZIO);
    setTocados({});
    setTentouSalvar(false);
    setCepStatus(null);
    setCarregando(true);
    carregarDadosFiscais(companyId)
      .then(dados => {
        if (!ativo) return;
        const preenchido = daApi(dados);
        ultimoCep.current = apenasDigitos(preenchido.zipCode);
        setForm(preenchido);
      })
      .catch(err => {
        // 404 = ainda não cadastrado: começa vazio.
        if (ativo && err?.response?.status !== 404) toastError(err);
      })
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [aberto, companyId]);

  const erros = validarDadosFiscais(form);
  const valido = Object.keys(erros).length === 0;

  const set = (campo, valor) =>
    setForm(atual => ({
      ...atual,
      [campo]: valor,
      // Cidade digitada à mão invalida o código IBGE vindo do CEP.
      ...(campo === "city" ? { cityIbgeCode: "" } : {})
    }));

  const tocar = campo => setTocados(atual => ({ ...atual, [campo]: true }));

  const erroDe = campo =>
    (tocados[campo] || tentouSalvar) && erros[campo]
      ? i18n.t(erros[campo])
      : "";

  const handleCep = async valor => {
    const formatado = formatarCep(valor);
    set("zipCode", formatado);
    const digitos = apenasDigitos(formatado);
    if (digitos.length !== 8 || digitos === ultimoCep.current) return;
    ultimoCep.current = digitos;
    setCepStatus("buscando");
    try {
      const endereco = await buscarCep(digitos);
      setForm(atual => ({
        ...atual,
        street: endereco.street || atual.street,
        district: endereco.district || atual.district,
        city: endereco.city || atual.city,
        cityIbgeCode: endereco.cityIbgeCode || "",
        state: endereco.state || atual.state
      }));
      setCepStatus(null);
    } catch (err) {
      setCepStatus("naoEncontrado");
    }
  };

  const handleSalvar = async () => {
    setTentouSalvar(true);
    if (!valido) return;
    setSalvando(true);
    try {
      const salvo = await salvarDadosFiscais(companyId, paraApi(form));
      i18nToast.success("notaFiscal.dados.salvos");
      aoSalvo && aoSalvo(salvo);
      aoFechar();
    } catch (err) {
      toastError(err);
    }
    setSalvando(false);
  };

  const campo = (nomeCampo, rotulo, props = {}) => (
    <TextField
      fullWidth
      size="small"
      variant="outlined"
      margin="dense"
      id={`dados-fiscais-${nomeCampo}`}
      label={i18n.t(rotulo)}
      value={form[nomeCampo]}
      onChange={e => set(nomeCampo, e.target.value)}
      onBlur={() => tocar(nomeCampo)}
      error={!!erroDe(nomeCampo)}
      helperText={erroDe(nomeCampo) || props.helperText}
      disabled={carregando || salvando}
      {...props}
    />
  );

  return (
    <Dialog
      open={!!aberto}
      onClose={salvando ? undefined : aoFechar}
      maxWidth="sm"
      fullWidth
      fullScreen={telaCheia}
      aria-labelledby="dialogo-dados-fiscais-titulo"
    >
      <DialogTitle id="dialogo-dados-fiscais-titulo">
        {nome
          ? i18n.t("notaFiscal.dados.tituloDe", { nome })
          : i18n.t("notaFiscal.dados.titulo")}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {i18n.t("notaFiscal.dados.descricao")}
        </Typography>
        <Grid container spacing={1}>
          <Grid item xs={12} sm={5}>
            {campo("document", "notaFiscal.dados.documento", {
              value: formatTaxId(form.document),
              onChange: e => set("document", apenasDigitos(e.target.value)),
              inputProps: { inputMode: "numeric", maxLength: 18 },
              required: true,
              autoFocus: true
            })}
          </Grid>
          <Grid item xs={12} sm={7}>
            {campo("legalName", "notaFiscal.dados.razaoSocial", {
              required: true,
              inputProps: { maxLength: 150 }
            })}
          </Grid>
          <Grid item xs={12}>
            {campo("email", "notaFiscal.dados.email", {
              type: "email",
              required: true,
              inputProps: { maxLength: 150 }
            })}
          </Grid>
          <Grid item xs={12} sm={4}>
            {campo("zipCode", "notaFiscal.dados.cep", {
              onChange: e => handleCep(e.target.value),
              required: true,
              inputProps: { inputMode: "numeric", maxLength: 9 },
              helperText:
                cepStatus === "buscando"
                  ? i18n.t("notaFiscal.dados.cepBuscando")
                  : cepStatus === "naoEncontrado"
                    ? i18n.t("notaFiscal.dados.cepNaoEncontrado")
                    : undefined,
              InputProps:
                cepStatus === "buscando"
                  ? {
                      endAdornment: (
                        <InputAdornment position="end">
                          <CircularProgress size={16} />
                        </InputAdornment>
                      )
                    }
                  : undefined
            })}
          </Grid>
          <Grid item xs={12} sm={8}>
            {campo("street", "notaFiscal.dados.rua", { required: true })}
          </Grid>
          <Grid item xs={4} sm={3}>
            {campo("number", "notaFiscal.dados.numero", { required: true })}
          </Grid>
          <Grid item xs={8} sm={9}>
            {campo("complement", "notaFiscal.dados.complemento")}
          </Grid>
          <Grid item xs={12} sm={5}>
            {campo("district", "notaFiscal.dados.bairro", { required: true })}
          </Grid>
          <Grid item xs={8} sm={5}>
            {campo("city", "notaFiscal.dados.cidade", { required: true })}
          </Grid>
          <Grid item xs={4} sm={2}>
            {campo("state", "notaFiscal.dados.uf", {
              select: true,
              required: true,
              children: UFS.map(uf => (
                <MenuItem key={uf} value={uf}>
                  {uf}
                </MenuItem>
              ))
            })}
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={aoFechar} disabled={salvando}>
          {i18n.t("notaFiscal.dados.fechar")}
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSalvar}
          disabled={carregando || salvando}
          startIcon={salvando ? <CircularProgress size={14} /> : null}
        >
          {i18n.t("notaFiscal.dados.salvar")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DialogoDadosFiscais;
