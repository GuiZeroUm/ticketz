/** @jest-environment node */

import { optimisticMove, tasksInColumn } from "./taskBoardState";

const columns = {
  todo: { id: 1, isDone: false },
  doing: { id: 2, isDone: false },
  done: { id: 3, isDone: true }
};

const seed = [
  { id: 1, title: "A", columnId: 1, position: 0, completedAt: null },
  { id: 2, title: "B", columnId: 1, position: 1, completedAt: null },
  { id: 3, title: "C", columnId: 2, position: 0, completedAt: null }
];

describe("task board optimistic movement", () => {
  it("reorders tasks inside a column", () => {
    const moved = optimisticMove(seed, 1, columns.todo, 1);
    expect(tasksInColumn(moved, 1).map(task => task.id)).toEqual([2, 1]);
  });

  it("moves a task between columns and normalizes both lists", () => {
    const moved = optimisticMove(seed, 2, columns.doing, 0);
    expect(tasksInColumn(moved, 1).map(task => task.id)).toEqual([1]);
    expect(tasksInColumn(moved, 2).map(task => task.id)).toEqual([2, 3]);
  });

  it("sets and clears the visible completion date", () => {
    const completed = optimisticMove(seed, 1, columns.done, 0);
    const doneTask = tasksInColumn(completed, 3)[0];
    expect(doneTask.completedAt).toBeTruthy();

    const reopened = optimisticMove(completed, 1, columns.todo, 0);
    expect(tasksInColumn(reopened, 1)[0].completedAt).toBeNull();
  });
});
