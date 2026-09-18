import { Request, Response } from "express";
import * as Yup from "yup";
import AppError from "../errors/AppError";
import {
  criarBusca,
  listarLeads,
  listarProdutos,
  statusDaBusca,
  Lead
} from "../services/ProspeccaoServices/ProspeccaoApi";

const STATUS_TERMINAIS = ["ok", "failed", "timeout"];

const serializaLead = (lead: Lead) => ({
  id: lead.id,
  nome: lead.nome,
  telefone: lead.telefone,
  categoria: lead.categoria,
  endereco: lead.endereco,
  instagramHandle: lead.instagram_handle,
  instagramBio: lead.instagram_bio,
  instagramSeguidores: lead.instagram_seguidores,
  instagramWhatsapp: lead.instagram_whatsapp,
  idiomaSugerido: lead.idioma_sugerido,
  status: lead.status,
  rascunho: lead.rascunho,
  erro: lead.erro
});

export const produtos = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  return res.json(await listarProdutos());
};

const buscaSchema = Yup.object().shape({
  nicho: Yup.string().trim().max(120),
  cidade: Yup.string().trim().max(120),
  maxResultados: Yup.number().integer().min(1).max(100),
  profundidade: Yup.number().integer().min(1).max(50),
  tom: Yup.string().oneOf(["curta", "media", "longa"]),
  produto: Yup.string().trim().max(60).required(),
  somenteComWhatsapp: Yup.boolean()
});

export const store = async (req: Request, res: Response): Promise<Response> => {
  const {
    nicho,
    cidade,
    maxResultados,
    profundidade,
    tom,
    produto,
    somenteComWhatsapp
  } = req.body;

  try {
    await buscaSchema.validate({
      nicho,
      cidade,
      maxResultados,
      profundidade,
      tom,
      produto,
      somenteComWhatsapp
    });
  } catch (erro) {
    throw new AppError((erro as Yup.ValidationError).message, 400);
  }

  if (!String(nicho || "").trim() || !String(cidade || "").trim()) {
    throw new AppError("ERR_PROSPECCAO_NICHO_CIDADE_OBRIGATORIOS", 400);
  }

  const jobId = await criarBusca({
    nicho: String(nicho).trim(),
    cidade: String(cidade).trim(),
    maxResultados: maxResultados ? Number(maxResultados) : 10,
    profundidade: profundidade ? Number(profundidade) : undefined,
    somenteComWhatsapp,
    tom: tom || "media",
    produto
  });

  return res.status(202).json({ jobId });
};

// Uma chamada só para a tela: o status da raspagem e os rascunhos vivem em
// serviços diferentes, mas quem está olhando a tela só quer saber se já pode
// mandar mensagem.
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { jobId } = req.params;

  const statusBusca = await statusDaBusca(jobId);
  const raspagemTerminou = STATUS_TERMINAIS.includes(statusBusca);

  // Enquanto o Google Maps não devolve nada não existe lead para consultar;
  // poupa uma ida ao bridge a cada poll.
  const leads = raspagemTerminou ? await listarLeads(jobId) : [];
  const pendentes = leads.filter(lead => lead.status === "pendente").length;

  return res.json({
    jobId,
    statusBusca,
    raspagemTerminou,
    pendentes,
    // Só é "concluído" quando todo lead saiu de pendente. Lista vazia não conta:
    // o bridge ainda pode estar gravando os leads que acabou de receber.
    concluido: raspagemTerminou && leads.length > 0 && pendentes === 0,
    leads: leads.map(serializaLead)
  });
};
