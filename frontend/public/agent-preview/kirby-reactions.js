// Visual reactions use only the current user's message and the reply shown in
// this chat. They do not imply that Hermes performed an unreported action.
const normalize = text =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function animationForRequest(text) {
  const message = normalize(text);
  if (
    /\b(resuma|resumir|organize|organizar|prepare|escreva|redija|crie)\b/.test(
      message
    )
  ) {
    return "working";
  }
  if (
    /\b(como|porque|por que|qual|duvida|explica|entender)\b|\?/.test(message)
  ) {
    return "curious";
  }
  return "thinking";
}

export function animationForReply(userText, replyText) {
  const context = normalize(`${userText} ${replyText}`);
  const reply = normalize(replyText);
  if (
    /\b(lamento|sinto muito|meus sentimentos|perda|falecimento)\b/.test(context)
  ) {
    return "sad";
  }
  if (
    /\b(erro|falha|problema|indisponivel|nao consegui|nao posso)\b/.test(reply)
  ) {
    return "confused";
  }
  if (/\b(parabens|concluido|resolvido|deu certo|sucesso)\b/.test(reply)) {
    return "celebrate";
  }
  if (/\b(haha|kkkk|rsrs)\b|[😂😄]/u.test(reply)) {
    return "laughing";
  }
  if (/\b(obrigad[oa]|excelente|otimo)\b/.test(context)) {
    return "proud";
  }
  if (/\b(como|qual|quer|posso ajudar|me conte)\b|\?/.test(reply)) {
    return "curious";
  }
  return "happy";
}
