import EmailAccount from "../../../models/EmailAccount";
import Queue from "../../../models/Queue";
import Ticket from "../../../models/Ticket";
import Whatsapp from "../../../models/Whatsapp";
import GetTicketTransferOptionsService from "../GetTicketTransferOptionsService";
import ShowTicketService from "../ShowTicketService";

jest.mock("../../../models/EmailAccount");
jest.mock("../../../models/Queue");
jest.mock("../../../models/Whatsapp");
jest.mock("../ShowTicketService");

const showTicket = ShowTicketService as jest.MockedFunction<
  typeof ShowTicketService
>;
const whatsappFindAll = Whatsapp.findAll as jest.MockedFunction<
  typeof Whatsapp.findAll
>;
const queueFindAll = Queue.findAll as jest.MockedFunction<typeof Queue.findAll>;

it("returns only global or explicitly linked queues for each connection", async () => {
  showTicket.mockResolvedValue({
    id: 10,
    companyId: 7,
    whatsappId: 1,
    channel: "whatsapp",
    isGroup: false,
    contact: { isGroup: false }
  } as Ticket);
  whatsappFindAll.mockResolvedValue([
    {
      id: 1,
      name: "Matriz",
      channel: "whatsapp",
      status: "CONNECTED"
    },
    {
      id: 2,
      name: "Filial",
      channel: "whatsapp",
      status: "CONNECTED"
    }
  ] as Whatsapp[]);
  queueFindAll.mockResolvedValue([
    { id: 10, name: "Legado", color: "#111111", whatsapps: [] },
    {
      id: 11,
      name: "Matriz",
      color: "#222222",
      whatsapps: [{ id: 1 }]
    },
    {
      id: 12,
      name: "Filial",
      color: "#333333",
      whatsapps: [{ id: 2 }]
    }
  ] as Queue[]);

  const result = await GetTicketTransferOptionsService({
    ticketId: 10,
    companyId: 7
  });

  expect(result.connections).toEqual([
    expect.objectContaining({
      id: 1,
      isCurrent: true,
      queues: [
        expect.objectContaining({ id: 10 }),
        expect.objectContaining({ id: 11 })
      ]
    }),
    expect.objectContaining({
      id: 2,
      isCurrent: false,
      queues: [
        expect.objectContaining({ id: 10 }),
        expect.objectContaining({ id: 12 })
      ]
    })
  ]);
});

describe("email tickets", () => {
  const emailTicket = (data: Record<string, unknown> = {}) =>
    ({
      id: 10,
      companyId: 7,
      whatsappId: null,
      emailAccountId: 55,
      channel: "email",
      isGroup: false,
      contact: { isGroup: false },
      ...data
    }) as unknown as Ticket;

  const queues = [
    { id: 10, name: "Legado", color: "#111111", whatsapps: [] },
    { id: 12, name: "Filial", color: "#333333", whatsapps: [{ id: 2 }] }
  ] as unknown as Queue[];

  it("offers the email account as the only option with every company queue", async () => {
    showTicket.mockResolvedValue(emailTicket());
    (EmailAccount.findOne as jest.Mock).mockResolvedValue({
      id: 55,
      name: "Suporte",
      address: "suporte@empresa.com",
      status: "active"
    });
    queueFindAll.mockResolvedValue(queues);

    const result = await GetTicketTransferOptionsService({
      ticketId: 10,
      companyId: 7
    });

    expect(whatsappFindAll).not.toHaveBeenCalled();
    expect(result).toEqual({
      currentWhatsappId: 55,
      isGroup: false,
      connections: [
        {
          id: 55,
          name: "Suporte",
          channel: "email",
          status: "active",
          isCurrent: true,
          queues: [
            { id: 10, name: "Legado", color: "#111111" },
            { id: 12, name: "Filial", color: "#333333" }
          ]
        }
      ]
    });
  });

  it("loads the account with the default scope, restricted by company and without secrets", async () => {
    showTicket.mockResolvedValue(emailTicket());
    (EmailAccount.findOne as jest.Mock).mockResolvedValue({
      id: 55,
      name: null,
      address: "suporte@empresa.com",
      status: "active"
    });
    queueFindAll.mockResolvedValue(queues);

    const result = await GetTicketTransferOptionsService({
      ticketId: 10,
      companyId: 7
    });

    expect(EmailAccount.scope).not.toHaveBeenCalled();
    const options = (EmailAccount.findOne as jest.Mock).mock.calls[0][0];
    expect(options.where).toEqual({ id: 55, companyId: 7 });
    expect(options.attributes).not.toContain("credentials");
    expect(options.attributes).not.toContain("syncCursor");
    expect(result.connections[0].name).toBe("suporte@empresa.com");
  });

  it("returns no option when the ticket has no email account", async () => {
    showTicket.mockResolvedValue(emailTicket({ emailAccountId: null }));
    queueFindAll.mockResolvedValue(queues);

    const result = await GetTicketTransferOptionsService({
      ticketId: 10,
      companyId: 7
    });

    expect(EmailAccount.findOne).not.toHaveBeenCalled();
    expect(result.connections).toEqual([]);
    expect(result.currentWhatsappId).toBeNull();
  });
});
