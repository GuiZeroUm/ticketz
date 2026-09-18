// Espelha `backend/src/helpers/prospeccao.ts`: a Prospecção consome uma API
// externa que gasta crédito de IA por lead e não separa por tenant, então só
// existe no tenant dono da ferramenta. Quem decide de verdade é o backend
// (middleware isProspeccaoUser); aqui é só pra não mostrar um menu que
// responderia 401.
const SLUGS = ["teste"];

export const podeVerProspeccao = user => {
  const slug = String(user?.company?.slug || "")
    .trim()
    .toLowerCase();
  if (!slug || !SLUGS.includes(slug)) return false;
  return user?.super === true || user?.profile === "admin";
};

// O lead pode vir com telefone formatado do Google Maps ("(68) 99988-4999") ou
// com o WhatsApp do Instagram, que já vem com DDI. O wa.me só aceita dígitos e
// exige o DDI, então normalizamos os dois casos.
export const normalizaTelefone = (...candidatos) => {
  for (const candidato of candidatos) {
    const digitos = String(candidato || "").replace(/\D/g, "");
    if (!digitos) continue;

    // 12-13 dígitos começando em 55 já é um número brasileiro com DDI.
    if (digitos.startsWith("55") && digitos.length >= 12) return digitos;
    // 10-11 dígitos é DDD + número local: falta o DDI.
    if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
    // Qualquer outro tamanho é número estrangeiro (a busca aceita outros
    // países): repassamos como veio, sem inventar DDI.
    if (digitos.length >= 8) return digitos;
  }
  return "";
};

export const linkWhatsapp = (telefone, mensagem) => {
  const numero = normalizaTelefone(telefone);
  if (!numero) return "";
  const texto = String(mensagem || "").trim();
  return texto
    ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/${numero}`;
};

export const telefoneDoLead = lead =>
  normalizaTelefone(lead?.telefone, lead?.instagramWhatsapp);

export default podeVerProspeccao;
