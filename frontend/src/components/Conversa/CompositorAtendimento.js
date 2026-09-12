import React, { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { MessageSquare, StickyNote, Send } from "lucide-react";
import { toast } from "react-toastify";
import MessageInput from "../MessageInputCustom";
import { Botao } from "../interface";
import { i18n } from "../../translate/i18n";
import useTicketNotes from "../../hooks/useTicketNotes";
import toastError from "../../errors/toastError";

export default function CompositorAtendimento({ ticket, aoSalvarNota }) {
  const [modo, definirModo] = useState("responder");
  const [nota, definirNota] = useState("");
  const [salvando, definirSalvando] = useState(false);
  const { saveNote } = useTicketNotes();
  const salvar = async evento => {
    evento.preventDefault();
    if (nota.trim().length < 2 || salvando) return;
    definirSalvando(true);
    try {
      await saveNote({
        note: nota.trim(),
        ticketId: ticket.id,
        contactId: ticket.contactId
      });
      definirNota("");
      aoSalvarNota();
      toast.success(i18n.t("common.success"));
    } catch (erro) {
      toastError(erro);
    }
    definirSalvando(false);
  };
  return (
    <Tabs.Root
      value={modo}
      onValueChange={definirModo}
      className="conversa-compositor"
      data-modo={modo}
    >
      <Tabs.List
        className="conversa-modos"
        aria-label={i18n.t("conversa.modoMensagem")}
      >
        <Tabs.Trigger value="responder">
          <MessageSquare size={14} />
          {i18n.t("conversa.responder")}
        </Tabs.Trigger>
        {!(ticket.isGroup && ticket.contact?.groupMode !== "ticket") && (
          <Tabs.Trigger value="nota">
            <StickyNote size={14} />
            {i18n.t("conversa.nota")}
          </Tabs.Trigger>
        )}
      </Tabs.List>
      <Tabs.Content value="responder" forceMount hidden={modo !== "responder"}>
        <MessageInput ticket={ticket} showTabGroups />
      </Tabs.Content>
      <Tabs.Content value="nota">
        <form className="conversa-nota" onSubmit={salvar}>
          <textarea
            rows={3}
            value={nota}
            onChange={e => definirNota(e.target.value)}
            aria-label={i18n.t("conversa.nota")}
            placeholder={i18n.t("conversa.notaAjuda")}
            disabled={salvando}
          />
          <footer>
            <small>{i18n.t("conversa.notaPrivada")}</small>
            <Botao
              type="submit"
              variante="primary"
              disabled={salvando || nota.trim().length < 2}
            >
              <Send size={14} />
              {i18n.t("common.save")}
            </Botao>
          </footer>
        </form>
      </Tabs.Content>
      <div className="conversa-teclado">
        {i18n.t(modo === "nota" ? "conversa.notaPrivada" : "conversa.atalho")}
      </div>
    </Tabs.Root>
  );
}
