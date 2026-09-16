import { proto } from "libzapitu-rf";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { Session } from "../../libs/wbot";
import { postMetaText } from "./SendMetaTextMessageService";

// Saudacao, fora de horario, menu de fila, chatbot e avaliacao vivem no
// wbotMessageListener e usam o wbot so para enviar texto - nenhuma delas chama
// API propria do Baileys. Este adaptador entrega um objeto com a mesma forma
// que elas esperam, para que o caminho oficial reaproveite a logica em vez de
// duplicar centenas de linhas (e voltar a divergir na proxima mudanca).
//
// O envio aqui e cru de proposito: quem chama grava a mensagem com
// verifyMessage logo depois, exatamente como no Baileys.
export const buildMetaWbot = (connection: Whatsapp): Session =>
  ({
    id: connection.id,
    sendMessage: async (jid: string, content: { text?: string }) => {
      const to = jid.replace(/\D/g, "");
      const body = content.text || "";
      const wamid = await postMetaText(connection, to, body);

      return {
        key: { id: wamid, fromMe: true, remoteJid: jid },
        message: { conversation: body },
        status: 1,
        messageTimestamp: Math.floor(Date.now() / 1000)
      };
    }
  }) as unknown as Session;

// As mesmas funcoes leem o texto recebido via getBodyMessage(msg.message), que
// so precisa de conversation - o resto do proto nao e tocado.
export const metaInboundStub = (
  ticket: Ticket,
  body: string
): proto.IWebMessageInfo =>
  ({
    key: {
      id: `meta-inbound-${ticket.id}`,
      fromMe: false,
      remoteJid: `${ticket.contact?.number}@s.whatsapp.net`
    },
    message: { conversation: body }
  }) as unknown as proto.IWebMessageInfo;
