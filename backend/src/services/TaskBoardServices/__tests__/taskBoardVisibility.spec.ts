import { Op } from "sequelize";
import UserQueue from "../../../models/UserQueue";
import { taskVisibilityWhere } from "../TaskBoardV2Service";

describe("task board visibility predicate", () => {
  beforeEach(() => jest.restoreAllMocks());

  it("combines global, direct and every authorized queue", async () => {
    const findAll = jest
      .spyOn(UserQueue, "findAll")
      .mockResolvedValue([{ queueId: 7 }, { queueId: 9 }] as UserQueue[]);

    const where = (await taskVisibilityWhere(42)) as Record<symbol, unknown[]>;

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 42 } })
    );
    expect(where[Op.or]).toEqual([
      { targetType: "GLOBAL" },
      { targetType: "USER", assignedUserId: 42 },
      { targetType: "QUEUE", assignedQueueId: { [Op.in]: [7, 9] } }
    ]);
  });

  it("does not add an unrestricted queue branch for users without queues", async () => {
    jest.spyOn(UserQueue, "findAll").mockResolvedValue([]);
    const where = (await taskVisibilityWhere(5)) as Record<symbol, unknown[]>;
    expect(where[Op.or]).toHaveLength(2);
  });
});
