import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

export default function LinhaDoTempoContato({ contactId, onBack }) {
  const [messages, setMessages] = useState([]);
  const [tickets, setTickets] = useState({});
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = async nextCursor => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get(
        `/contacts/${contactId}/conversation-history`,
        { params: nextCursor ? { cursor: nextCursor } : {} }
      );
      setMessages(previous =>
        nextCursor ? [...data.messages, ...previous] : data.messages
      );
      setTickets(previous => ({
        ...previous,
        ...Object.fromEntries(data.tickets.map(ticket => [ticket.id, ticket]))
      }));
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (_error) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMessages([]);
    setTickets({});
    setCursor(null);
    load(null);
    // A troca de contato remonta esta visualização no painel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  return (
    <div className="contexto-linha-tempo">
      <button type="button" onClick={onBack}>
        {i18n.t("contexto.voltarAtendimentos")}
      </button>
      {hasMore && (
        <button type="button" disabled={loading} onClick={() => load(cursor)}>
          {i18n.t("contexto.carregarAnteriores")}
        </button>
      )}
      {loading && <p className="ew-muted">{i18n.t("contexto.carregando")}</p>}
      {error && <p className="ew-muted">{i18n.t("contexto.erroHistorico")}</p>}
      {!loading && !messages.length && !error && (
        <p className="ew-muted">{i18n.t("contexto.semMensagens")}</p>
      )}
      {messages.map(message => {
        const source = tickets[message.ticketId];
        return (
          <article key={message.id}>
            <div className="contexto-linha-tempo-meta">
              <span>
                {message.fromMe
                  ? i18n.t("contexto.equipe")
                  : i18n.t("contexto.cliente")}
              </span>
              <time>
                {new Date(message.createdAt).toLocaleString(i18n.language)}
              </time>
            </div>
            <p>
              {message.body || message.mediaType || i18n.t("contexto.midia")}
            </p>
            {source && (
              <Link to={`/tickets/${source.uuid}`}>
                #{source.id} · {source.queue || i18n.t("contexto.semFila")}
              </Link>
            )}
          </article>
        );
      })}
    </div>
  );
}
