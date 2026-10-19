import { Op } from "sequelize";

// Destinatários de campanha: números válidos no WhatsApp e nunca NULL. A lista
// de contatos hoje exige número, mas a guarda fica aqui para que qualquer
// origem futura (contato de e-mail, sem telefone) seja ignorada em vez de
// quebrar `number.endsWith` no preparo do disparo.
export const campaignRecipientWhere = () => ({
  isWhatsappValid: true,
  number: { [Op.ne]: null }
});

export const filterCampaignRecipients = <T extends { number?: string | null }>(
  contacts: T[]
): T[] =>
  contacts.filter(
    contact =>
      typeof contact.number === "string" && contact.number.trim() !== ""
  );
