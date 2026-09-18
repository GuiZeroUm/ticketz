import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { toast } from "react-toastify";

import {
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import SearchIcon from "@material-ui/icons/Search";
import RefreshIcon from "@material-ui/icons/Refresh";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";

import CardLead from "./CardLead";

const useStyles = makeStyles(theme => ({
  painel: {
    flex: 1,
    overflowY: "auto",
    padding: theme.spacing(1),
    ...theme.scrollbarStyles
  },
  formulario: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(1.5)
  },
  acoesFormulario: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    flexWrap: "wrap"
  },
  progresso: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(1.5)
  },
  barra: {
    marginTop: theme.spacing(1)
  },
  vazio: {
    padding: theme.spacing(4),
    textAlign: "center",
    color: theme.palette.text.secondary
  },
  contador: {
    margin: theme.spacing(1, 0.5, 1.5)
  }
}));

const TONS = [
  { value: "curta", label: "Curta (1-2 frases)" },
  { value: "media", label: "Média (3-4 frases)" },
  { value: "longa", label: "Longa (um parágrafo)" }
];

const FORM_INICIAL = {
  nicho: "",
  cidade: "",
  maxResultados: 10,
  produto: "",
  tom: "media",
  somenteComWhatsapp: true
};

const CHAVE_ULTIMO_JOB = "prospeccaoUltimoJob";

// Entre a raspagem terminar e o primeiro lead aparecer no bridge roda o
// enriquecimento via Instagram, que é a etapa mais lenta de todas: numa busca
// de 10 leads medimos 4min50s só aí, com a raspagem levando pouco mais de um
// minuto. Lista vazia depois da raspagem é o estado normal desse intervalo, não
// um resultado — por isso não existe aqui nenhuma folga curta declarando
// "nenhum lead": só o orçamento total abaixo interrompe o acompanhamento.
const INTERVALO_POLL_MS = 6000;
const LIMITE_TOTAL_MS = 15 * 60 * 1000;

const rotuloProduto = slug =>
  String(slug || "")
    .split("-")
    .filter(Boolean)
    .map(parte => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(" ");

const Prospeccao = () => {
  const classes = useStyles();

  const [form, setForm] = useState(FORM_INICIAL);
  const [produtos, setProdutos] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [leads, setLeads] = useState([]);
  const [rascunhos, setRascunhos] = useState({});
  const [progresso, setProgresso] = useState(null);
  const [iniciando, setIniciando] = useState(false);
  const [acompanhando, setAcompanhando] = useState(false);
  const [aviso, setAviso] = useState("");

  const temporizador = useRef(null);
  const inicioDoJob = useRef(null);
  const raspagemTerminouEm = useRef(null);
  const montado = useRef(true);
  // Trocar de busca não cancela a requisição que já saiu: sem isso, a resposta
  // atrasada da busca anterior sobrescreveria os leads da nova.
  const jobAcompanhado = useRef(null);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  useEffect(() => {
    const carregaProdutos = async () => {
      try {
        const { data } = await api.get("/prospeccao/produtos");
        if (!montado.current) return;
        const lista = Array.isArray(data) ? data : [];
        setProdutos(lista);
        setForm(atual => ({
          ...atual,
          produto:
            atual.produto ||
            (lista.includes("espaco-whats") ? "espaco-whats" : lista[0] || "")
        }));
      } catch (err) {
        toastError(err);
      }
    };
    carregaProdutos();
  }, []);

  // Rascunho editado na tela vence o que veio da API: o poll seguinte não pode
  // apagar o que a pessoa acabou de escrever.
  const sincronizaRascunhos = useCallback(novosLeads => {
    setRascunhos(atual => {
      const proximo = { ...atual };
      novosLeads.forEach(lead => {
        if (proximo[lead.id] === undefined && lead.rascunho) {
          proximo[lead.id] = lead.rascunho;
        }
      });
      return proximo;
    });
  }, []);

  const consulta = useCallback(
    async idDoJob => {
      try {
        const { data } = await api.get(`/prospeccao/buscas/${idDoJob}`);
        if (!montado.current || jobAcompanhado.current !== idDoJob) return;

        setProgresso(data);
        setLeads(data.leads || []);
        sincronizaRascunhos(data.leads || []);

        if (data.raspagemTerminou && !raspagemTerminouEm.current) {
          raspagemTerminouEm.current = Date.now();
        }

        if (data.statusBusca === "failed" || data.statusBusca === "timeout") {
          setAcompanhando(false);
          setAviso(
            data.statusBusca === "timeout"
              ? "A raspagem do Google Maps estourou o tempo limite. Tente de novo com menos resultados."
              : "A raspagem do Google Maps falhou. Tente de novo em alguns minutos."
          );
          return;
        }

        if (data.concluido) {
          setAcompanhando(false);
          setAviso("");
          return;
        }

        if (Date.now() - inicioDoJob.current > LIMITE_TOTAL_MS) {
          setAcompanhando(false);
          setAviso(
            (data.leads || []).length === 0
              ? "A busca ainda não devolveu nenhum lead. O enriquecimento pode estar lento — clique em Atualizar daqui a alguns minutos antes de tentar outro nicho ou cidade."
              : "A geração dos rascunhos está demorando mais que o normal. Os leads prontos já aparecem abaixo — use Atualizar para buscar o resto."
          );
          return;
        }

        temporizador.current = setTimeout(
          () => consulta(idDoJob),
          INTERVALO_POLL_MS
        );
      } catch (err) {
        if (!montado.current || jobAcompanhado.current !== idDoJob) return;
        setAcompanhando(false);
        toastError(err);
      }
    },
    [sincronizaRascunhos]
  );

  const acompanha = useCallback(
    idDoJob => {
      if (temporizador.current) clearTimeout(temporizador.current);
      jobAcompanhado.current = idDoJob;
      setAcompanhando(true);
      setAviso("");
      consulta(idDoJob);
    },
    [consulta]
  );

  // Buscar leads leva minutos: se a pessoa recarregar a tela no meio, ela volta
  // acompanhando a mesma busca em vez de perder o trabalho.
  useEffect(() => {
    const salvo = localStorage.getItem(CHAVE_ULTIMO_JOB);
    if (!salvo) return;
    setJobId(salvo);
    inicioDoJob.current = Date.now();
    raspagemTerminouEm.current = null;
    acompanha(salvo);
  }, [acompanha]);

  const alteraCampo = campo => event => {
    const valor =
      campo === "somenteComWhatsapp"
        ? event.target.checked
        : event.target.value;
    setForm(atual => ({ ...atual, [campo]: valor }));
  };

  const inicia = async event => {
    event.preventDefault();
    if (!form.nicho.trim() || !form.cidade.trim() || !form.produto) return;

    setIniciando(true);
    try {
      const { data } = await api.post("/prospeccao/buscas", {
        nicho: form.nicho.trim(),
        cidade: form.cidade.trim(),
        maxResultados: Number(form.maxResultados) || 10,
        tom: form.tom,
        produto: form.produto,
        somenteComWhatsapp: form.somenteComWhatsapp
      });

      if (temporizador.current) clearTimeout(temporizador.current);
      setLeads([]);
      setRascunhos({});
      setProgresso(null);
      setJobId(data.jobId);
      localStorage.setItem(CHAVE_ULTIMO_JOB, data.jobId);
      inicioDoJob.current = Date.now();
      raspagemTerminouEm.current = null;
      acompanha(data.jobId);
    } catch (err) {
      toastError(err);
    } finally {
      setIniciando(false);
    }
  };

  const copia = async texto => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Rascunho copiado");
    } catch (err) {
      toast.error("Não consegui copiar o rascunho");
    }
  };

  const alteraRascunho = (id, texto) =>
    setRascunhos(atual => ({ ...atual, [id]: texto }));

  // Depois que o poll desiste (ou quando a pessoa volta na tela horas depois),
  // Atualizar é o jeito de buscar o que ficou pronto no meio tempo.
  const atualiza = () => {
    if (!jobId) return;
    inicioDoJob.current = Date.now();
    raspagemTerminouEm.current = null;
    acompanha(jobId);
  };

  const prontos = useMemo(
    () => leads.filter(lead => lead.status !== "pendente").length,
    [leads]
  );

  // Uma busca em andamento não bloqueia a próxima: `inicia` derruba o poll
  // anterior. Esperar a busca inteira para corrigir a cidade seria pior.
  const podeBuscar =
    !iniciando && !!form.nicho.trim() && !!form.cidade.trim() && !!form.produto;

  const mensagemDeEtapa = () => {
    if (!progresso) return "Enviando a busca...";
    if (!progresso.raspagemTerminou) {
      return "Raspando o Google Maps. Isso costuma levar de 1 a 3 minutos.";
    }
    if (leads.length === 0) {
      // A espera aqui passa de cinco minutos sem nada na tela mudar; dizer há
      // quanto tempo é o que diferencia "está trabalhando" de "travou".
      const minutos = raspagemTerminouEm.current
        ? Math.floor((Date.now() - raspagemTerminouEm.current) / 60000)
        : 0;
      return `Raspagem concluída. Enriquecendo os leads pelo Instagram — costuma levar de 3 a 6 minutos${
        minutos >= 1 ? ` (${minutos} min até agora)` : ""
      }.`;
    }
    if (progresso.pendentes > 0) {
      return `Escrevendo os rascunhos: ${prontos} de ${leads.length} prontos.`;
    }
    return "Finalizando...";
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>Prospecção</Title>
        <MainHeaderButtonsWrapper>
          <Button
            variant="outlined"
            color="primary"
            disabled={!jobId || acompanhando}
            startIcon={<RefreshIcon />}
            onClick={atualiza}
          >
            Atualizar
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper className={classes.painel} variant="outlined">
        <Paper className={classes.formulario} variant="outlined">
          <form onSubmit={inicia}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Nicho"
                  placeholder="hamburgueria"
                  fullWidth
                  variant="outlined"
                  size="small"
                  value={form.nicho}
                  onChange={alteraCampo("nicho")}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Cidade"
                  placeholder="Rio Branco, AC"
                  fullWidth
                  variant="outlined"
                  size="small"
                  value={form.cidade}
                  onChange={alteraCampo("cidade")}
                />
              </Grid>
              <Grid item xs={6} sm={4} md={2}>
                <TextField
                  label="Quantos leads"
                  type="number"
                  fullWidth
                  variant="outlined"
                  size="small"
                  inputProps={{ min: 1, max: 50 }}
                  value={form.maxResultados}
                  onChange={alteraCampo("maxResultados")}
                />
              </Grid>
              <Grid item xs={6} sm={4} md={2}>
                <FormControl variant="outlined" size="small" fullWidth>
                  <InputLabel id="prospeccao-produto">Produto</InputLabel>
                  <Select
                    labelId="prospeccao-produto"
                    label="Produto"
                    value={form.produto}
                    onChange={alteraCampo("produto")}
                  >
                    {produtos.map(produto => (
                      <MenuItem key={produto} value={produto}>
                        {rotuloProduto(produto)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4} md={2}>
                <FormControl variant="outlined" size="small" fullWidth>
                  <InputLabel id="prospeccao-tom">Tom</InputLabel>
                  <Select
                    labelId="prospeccao-tom"
                    label="Tom"
                    value={form.tom}
                    onChange={alteraCampo("tom")}
                  >
                    {TONS.map(tom => (
                      <MenuItem key={tom.value} value={tom.value}>
                        {tom.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <div className={classes.acoesFormulario}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={!podeBuscar}
                    startIcon={
                      iniciando ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <SearchIcon />
                      )
                    }
                  >
                    Buscar leads
                  </Button>
                  <FormControlLabel
                    control={
                      <Switch
                        color="primary"
                        checked={form.somenteComWhatsapp}
                        onChange={alteraCampo("somenteComWhatsapp")}
                      />
                    }
                    label="Só quem tem WhatsApp"
                  />
                  <Typography variant="body2" color="textSecondary">
                    Cada lead a mais soma tempo de enriquecimento e custo de IA.
                  </Typography>
                </div>
              </Grid>
            </Grid>
          </form>
        </Paper>

        {(acompanhando || aviso) && (
          <Paper className={classes.progresso} variant="outlined">
            <Typography variant="body2">
              {acompanhando ? mensagemDeEtapa() : aviso}
            </Typography>
            {acompanhando && <LinearProgress className={classes.barra} />}
          </Paper>
        )}

        {leads.length > 0 && (
          <Typography
            variant="body2"
            color="textSecondary"
            className={classes.contador}
          >
            {prontos} de {leads.length} leads com rascunho pronto
          </Typography>
        )}

        {leads.map(lead => (
          <CardLead
            key={lead.id}
            lead={lead}
            rascunho={rascunhos[lead.id] ?? lead.rascunho ?? ""}
            onRascunhoChange={alteraRascunho}
            onCopiar={copia}
          />
        ))}

        {!jobId && !acompanhando && (
          <div className={classes.vazio}>
            <Typography variant="body1">
              Escolha um nicho e uma cidade para buscar leads no Google Maps.
            </Typography>
            <Typography variant="body2">
              O sistema enriquece cada lead pelo Instagram e escreve um rascunho
              de mensagem pronto para mandar no WhatsApp.
            </Typography>
          </div>
        )}
      </Paper>
    </MainContainer>
  );
};

export default Prospeccao;
