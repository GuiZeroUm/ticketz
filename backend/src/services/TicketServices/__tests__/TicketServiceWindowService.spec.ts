import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import GetTicketServiceWindowService from "../TicketServiceWindowService";

const findMessage = jest.spyOn(Message, "findOne");

const ticket = { id: 7 } as unknown as Ticket;

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000);

beforeEach(() => jest.clearAllMocks());

it("reports the window as closed when the contact never wrote", async () => {
  findMessage.mockResolvedValue(null);

  await expect(GetTicketServiceWindowService(ticket)).resolves.toEqual({
    open: false,
    lastInboundAt: null,
    expiresAt: null
  });
});

it("keeps the window open inside 24 hours", async () => {
  const createdAt = hoursAgo(3);
  findMessage.mockResolvedValue({ id: "wamid", createdAt } as never);

  const window = await GetTicketServiceWindowService(ticket);

  expect(window.open).toBe(true);
  expect(window.lastInboundAt).toEqual(createdAt);
  expect(window.expiresAt).toEqual(new Date(createdAt.getTime() + 86400000));
});

it("closes the window after 24 hours", async () => {
  findMessage.mockResolvedValue({
    id: "wamid",
    createdAt: hoursAgo(25)
  } as never);

  await expect(GetTicketServiceWindowService(ticket)).resolves.toMatchObject({
    open: false
  });
});
