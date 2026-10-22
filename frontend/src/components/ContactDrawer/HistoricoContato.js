import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, ArrowUpRight } from "lucide-react";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import LinhaDoTempoContato from "./LinhaDoTempoContato";

export default function HistoricoContato({ contactId, ticketId }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [conversaCompleta, setConversaCompleta] = useState(false);
  useEffect(() => setConversaCompleta(false), [contactId]);
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(false);
    api
      .get("/tickets", {
        params: {
          contactId,
          status: "closed",
          isSearch: true,
          showAll: true,
          queueIds: "[]"
        }
      })
      .then(({ data }) => {
        if (ativo) setItens(data.tickets.filter(item => item.id !== ticketId));
      })
      .catch(() => {
        if (ativo) setErro(true);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [contactId, ticketId]);
  if (conversaCompleta)
    return (
      <LinhaDoTempoContato
        contactId={contactId}
        onBack={() => setConversaCompleta(false)}
      />
    );
  if (carregando || erro || !itens.length)
    return (
      <div className="contexto-historico">
        <button type="button" onClick={() => setConversaCompleta(true)}>
          {i18n.t("contexto.conversaCompleta")}
        </button>
        <p className="ew-muted">
          {i18n.t(
            carregando
              ? "contexto.carregando"
              : erro
                ? "contexto.erroHistorico"
                : "contexto.semHistorico"
          )}
        </p>
      </div>
    );
  return (
    <div className="contexto-historico">
      <button type="button" onClick={() => setConversaCompleta(true)}>
        {i18n.t("contexto.conversaCompleta")}
      </button>
      {itens.map(item => (
        <article key={item.id}>
          <Clock size={16} />
          <div>
            <strong>
              #{item.id} · {item.queue?.name || i18n.t("contexto.semFila")}
            </strong>
            <p>{item.user?.name}</p>
            <time>{new Date(item.updatedAt).toLocaleDateString()}</time>
            <p className="contexto-ultima">{item.lastMessage}</p>
            <Link to={`/tickets/${item.uuid}`}>
              {i18n.t("contexto.verConversa")} <ArrowUpRight size={13} />
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
