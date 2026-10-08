import { getPlanCapacityComparison } from "./plans";

jest.mock("../../services/config", () => ({
  getBackendURL: () => "/backend"
}));

test("compares the capacities from the catalog and follows changed plan limits", () => {
  const enterprise = { users: 100, connections: 20, queues: 50 };
  const ai = { users: 30, connections: 15, queues: 30 };
  expect(getPlanCapacityComparison(enterprise, ai)).toEqual([
    { key: "users", value: 100, extra: 70 },
    { key: "connections", value: 20, extra: 5 },
    { key: "queues", value: 50, extra: 20 }
  ]);
  expect(
    getPlanCapacityComparison(
      { ...enterprise, users: 80 },
      { ...ai, users: 40 }
    )[0].extra
  ).toBe(40);
});

test("does not advertise an increase without a valid, smaller comparison limit", () => {
  const enterprise = { users: 100, connections: 20, queues: 50 };
  expect(
    getPlanCapacityComparison(enterprise).every(item => item.extra === null)
  ).toBe(true);
  expect(
    getPlanCapacityComparison(enterprise, {
      users: 100,
      connections: 30,
      queues: 0
    }).every(item => item.extra === null)
  ).toBe(true);
});
