import { useContext, useEffect, useRef } from "react";
import { SocketContext } from "../../context/Socket/SocketContext";
import { temNotaEmAndamento } from "./estadoNota";

const INTERVALO_MS = 10000;
const EVENTO = /^company-\d+-invoice$/;

// Mantém as notas das faturas atualizadas:
// - evento `company-{id}-invoice` ({ action: "update", invoiceId, fiscalNote });
//   a plataforma (super) recebe o evento de todas as empresas;
// - reserva: recarrega a cada 10 s enquanto houver nota em andamento ou uma
//   baixa recente esperando a nota ser criada (aguardando).
const useAtualizacaoNotas = ({
  faturas,
  aoAtualizarNota,
  recarregar,
  aguardando = false
}) => {
  const socketManager = useContext(SocketContext);
  const aoAtualizarRef = useRef(aoAtualizarNota);
  const recarregarRef = useRef(recarregar);
  aoAtualizarRef.current = aoAtualizarNota;
  recarregarRef.current = recarregar;

  useEffect(() => {
    const socket = socketManager?.GetSocket?.();
    if (!socket || typeof socket.onAny !== "function") return undefined;
    const ouvinte = (evento, dados) => {
      if (!EVENTO.test(evento)) return;
      if (dados?.action !== "update" || !dados.invoiceId) return;
      aoAtualizarRef.current &&
        aoAtualizarRef.current(dados.invoiceId, dados.fiscalNote || null);
    };
    socket.onAny(ouvinte);
    // Só remove o próprio ouvinte: o socket é compartilhado pelo app.
    return () => socket.offAny && socket.offAny(ouvinte);
  }, [socketManager]);

  const emAndamento = temNotaEmAndamento(faturas) || aguardando;
  useEffect(() => {
    if (!emAndamento) return undefined;
    const timer = setInterval(() => {
      recarregarRef.current && recarregarRef.current();
    }, INTERVALO_MS);
    return () => clearInterval(timer);
  }, [emAndamento]);
};

export default useAtualizacaoNotas;
