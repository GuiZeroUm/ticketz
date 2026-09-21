import { Op } from "sequelize";
import {
  hasInboundMessage,
  shouldApplyQueueFilter,
  ticketQueueScope
} from "../TicketQueueAccess";

describe("ListTicketsService: visibilidade de filas", () => {
  it("não esconde atendimentos do administrador quando nenhuma fila foi vinculada", () => {
    expect(shouldApplyQueueFilter("admin", [])).toBe(false);
  });

  it("mantém a seleção explícita de filas do administrador", () => {
    expect(shouldApplyQueueFilter("admin", [1, 3])).toBe(true);
  });

  it("mantém o bloqueio por fila para usuário comum, inclusive sem filas", () => {
    expect(shouldApplyQueueFilter("user", [])).toBe(true);
    expect(shouldApplyQueueFilter("user", [2])).toBe(true);
  });
});

describe("ticketQueueScope", () => {
  it("dá ao administrador as filas escolhidas mais os atendimentos sem fila", () => {
    expect(ticketQueueScope("admin", [11, 16])).toEqual({
      queueId: { [Op.or]: [[11, 16], null] }
    });
  });

  it("dá ao atendente as filas dele mais o pool de triagem", () => {
    expect(ticketQueueScope("user", [11, 16])).toEqual({
      [Op.or]: [
        { queueId: { [Op.in]: [11, 16] } },
        { [Op.and]: [{ queueId: null }, hasInboundMessage] }
      ]
    });
  });

  // Cada disparo da régua de cobrança cria um pendente sem fila; sem esta
  // condição a fila de espera de todo atendente ficava cheia de conversas que
  // o cliente nunca começou.
  it("exige mensagem recebida para um ticket entrar no pool", () => {
    const scope = ticketQueueScope("user", [11]) as Record<symbol, unknown[]>;
    const poolBranch = scope[Op.or][1] as Record<symbol, unknown[]>;

    expect(poolBranch[Op.and]).toContain(hasInboundMessage);
    expect(String(hasInboundMessage.val)).toContain('"fromMe" = false');
  });
});
