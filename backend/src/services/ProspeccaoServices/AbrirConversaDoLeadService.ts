import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import ProspeccaoLead from "../../models/ProspeccaoLead";
import Ticket from "../../models/Ticket";
import CreateContactService from "../ContactServices/CreateContactService";
import CreateTicketService from "../TicketServices/CreateTicketService";

interface Request {
  leadId: number;
  companyId: number;
  userId: number;
  rascunho?: string;
}

interface Response {
  ticketId: number;
  ticketUuid: string;
  contactId: number;
  rascunho: string;
}

// O endereço e o Instagram viram informação adicional do contato: é o que o
// atendente precisa ver na conversa e não cabe no nome nem no número.
const informacoesAdicionais = (lead: ProspeccaoLead) => {
  const campos: { name: string; value: string }[] = [];
  if (lead.endereco) campos.push({ name: "Localização", value: lead.endereco });
  if (lead.instagramHandle) {
    campos.push({
      name: "Instagram",
      value: `https://instagram.com/${lead.instagramHandle}`
    });
  }
  if (lead.categoria) campos.push({ name: "Categoria", value: lead.categoria });
  return campos;
};

const buscaContatoExistente = async (
  telefone: string,
  companyId: number
): Promise<Contact | null> => {
  // Mesma tolerância de 8/9 dígitos que o CreateContactService aplica: sem
  // isso criaríamos um contato paralelo para quem já está na agenda.
  const variacoes = [telefone];
  if (
    telefone.startsWith("55") &&
    telefone.length === 13 &&
    telefone[4] === "9"
  ) {
    variacoes.push(`${telefone.slice(0, 4)}${telefone.slice(5)}`);
  } else if (telefone.startsWith("55") && telefone.length === 12) {
    variacoes.push(`${telefone.slice(0, 4)}9${telefone.slice(4)}`);
  }
  return Contact.findOne({
    where: { companyId, number: { [Op.in]: variacoes } }
  });
};

const AbrirConversaDoLeadService = async ({
  leadId,
  companyId,
  userId,
  rascunho
}: Request): Promise<Response> => {
  const lead = await ProspeccaoLead.findOne({
    where: { id: leadId, companyId }
  });
  if (!lead) throw new AppError("ERR_PROSPECCAO_LEAD_NAO_ENCONTRADO", 404);
  if (!lead.telefone) {
    throw new AppError("ERR_PROSPECCAO_LEAD_SEM_TELEFONE", 400);
  }

  const textoFinal = String(rascunho ?? lead.rascunho ?? "").trim();

  let contact = await buscaContatoExistente(lead.telefone, companyId);
  if (!contact) {
    contact = await CreateContactService({
      name: lead.nome || lead.telefone,
      number: lead.telefone,
      companyId,
      extraInfo: informacoesAdicionais(lead) as never
    });
  } else {
    // Contato que já existia não é sobrescrito, mas o que a prospecção
    // descobriu e ainda falta lá é informação nova e útil.
    const atuais = await ContactCustomField.findAll({
      where: { contactId: contact.id }
    });
    const nomes = new Set(atuais.map(campo => campo.name));
    const faltando = informacoesAdicionais(lead).filter(
      campo => !nomes.has(campo.name)
    );
    if (faltando.length) {
      await ContactCustomField.bulkCreate(
        faltando.map(campo => ({ ...campo, contactId: contact!.id })) as never
      );
    }
  }

  let ticket: Ticket;
  try {
    ticket = await CreateTicketService({
      contactId: contact.id,
      userId,
      companyId
    });
  } catch (erro) {
    // CreateTicketService recusa quando o contato já tem conversa aberta com
    // outra pessoa. Levar para a conversa existente é melhor do que falhar.
    const aberto = await Ticket.findOne({
      where: {
        contactId: contact.id,
        companyId,
        status: { [Op.in]: ["open", "pending"] }
      },
      order: [["updatedAt", "DESC"]]
    });
    if (!aberto) throw erro;
    ticket = aberto;
  }

  await lead.update({
    contactId: contact.id,
    ticketId: ticket.id,
    rascunho: textoFinal || lead.rascunho,
    abertoEm: lead.abertoEm || new Date()
  });

  return {
    ticketId: ticket.id,
    ticketUuid: ticket.uuid,
    contactId: contact.id,
    rascunho: textoFinal
  };
};

export default AbrirConversaDoLeadService;
