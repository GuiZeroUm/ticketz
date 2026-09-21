import {
  getTicketQueueId,
  isTicketQueueVisible,
  isUnansweredPoolTicket
} from "./ticketVisibility";

describe("ticket visibility", () => {
  it("keeps unassigned tickets visible as a triage pool", () => {
    expect(isTicketQueueVisible({ queueId: null }, [])).toBe(true);
    expect(isTicketQueueVisible({ queueId: null }, [13])).toBe(true);
  });

  it("filters tickets by the queues of the user", () => {
    expect(isTicketQueueVisible({ queueId: 13 }, [13])).toBe(true);
    expect(isTicketQueueVisible({ queueId: 99 }, [13])).toBe(false);
  });

  it("normalizes socket and API queue shapes", () => {
    expect(getTicketQueueId({ queue: { id: 11 } })).toBe(11);
    expect(getTicketQueueId({ queueId: 12 })).toBe(12);
  });
});

describe("isUnansweredPoolTicket", () => {
  // Cada disparo da regua de cobranca cria um pendente sem fila; enquanto
  // ninguem responde, nao ha atendimento esperando.
  it("holds back a pool ticket the agent has never seen", () => {
    expect(
      isUnansweredPoolTicket({ id: 1501, status: "pending", queueId: null }, [])
    ).toBe(true);
  });

  it("lets through a pool ticket already in the list", () => {
    expect(
      isUnansweredPoolTicket(
        { id: 1501, status: "pending", queueId: null },
        [1501]
      )
    ).toBe(false);
  });

  it("never holds back a ticket that has a queue", () => {
    expect(
      isUnansweredPoolTicket({ id: 1501, status: "pending", queueId: 11 }, [])
    ).toBe(false);
  });

  it("never holds back an open ticket", () => {
    expect(
      isUnansweredPoolTicket({ id: 1501, status: "open", queueId: null }, [])
    ).toBe(false);
  });
});
