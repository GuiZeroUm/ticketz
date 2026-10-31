import { Includeable } from "sequelize";
import Ticket from "../../../models/Ticket";
import loadTicketPage from "../loadTicketPage";

jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));

const findAll = Ticket.findAll as jest.Mock;

describe("loadTicketPage", () => {
  beforeEach(() => {
    findAll.mockReset();
  });

  it("limits ticket ids instead of joined rows", async () => {
    const tags = { as: "tags" } as unknown as Includeable;
    const full1 = { id: 1 };
    const full2 = { id: 2 };
    findAll
      .mockResolvedValueOnce([{ id: 2 }, { id: 1 }])
      .mockResolvedValueOnce([full1, full2]);

    await loadTicketPage({
      where: { companyId: 9 },
      include: [tags],
      filterInclude: [],
      limit: 40,
      offset: 80
    });

    const [idQuery, dataQuery] = findAll.mock.calls.map(c => c[0]);
    expect(idQuery.limit).toBe(40);
    expect(idQuery.offset).toBe(80);
    expect(idQuery.attributes).toEqual(["id"]);
    expect(idQuery.include).toEqual([]);
    expect(idQuery.where).toEqual({ companyId: 9 });
    expect(idQuery.subQuery).toBe(false);
    expect(idQuery.order).toEqual([
      ["updatedAt", "DESC"],
      ["id", "DESC"]
    ]);
    expect(dataQuery.limit).toBeUndefined();
    expect(dataQuery.offset).toBeUndefined();
    expect(dataQuery.where).toEqual({ id: [2, 1] });
    expect(dataQuery.include).toEqual([tags]);
  });

  it("returns tickets in the id query order", async () => {
    findAll
      .mockResolvedValueOnce([{ id: 2 }, { id: 1 }])
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    const page = await loadTicketPage({
      where: {},
      include: [],
      filterInclude: [],
      limit: 40
    });

    expect(page.map(t => t.id)).toEqual([2, 1]);
  });

  it("returns empty without loading relations", async () => {
    findAll.mockResolvedValueOnce([]);

    await expect(
      loadTicketPage({ where: {}, include: [], filterInclude: [], limit: 40 })
    ).resolves.toEqual([]);
    expect(findAll).toHaveBeenCalledTimes(1);
  });

  it("dedupes ids from a multiplying filter include", async () => {
    findAll
      .mockResolvedValueOnce([{ id: 2 }, { id: 2 }, { id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    const page = await loadTicketPage({
      where: {},
      include: [],
      filterInclude: [{ as: "messages" } as unknown as Includeable],
      limit: 40
    });

    expect(findAll.mock.calls[1][0].where).toEqual({ id: [2, 1] });
    expect(page.map(t => t.id)).toEqual([2, 1]);
  });
});
