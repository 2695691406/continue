import { describe, expect, test, beforeEach } from "vitest";
import { TaskManager } from "./taskManager";

describe("TaskManager", () => {
  let tm: TaskManager;

  beforeEach(() => {
    tm = new TaskManager();
  });

  describe("createTask", () => {
    test("creates a task with pending status and auto-generated ID", () => {
      const task = tm.createTask({
        subject: "Implement login",
        description: "Add login functionality",
      });

      expect(task.id).toMatch(/^task-\d+$/);
      expect(task.subject).toBe("Implement login");
      expect(task.description).toBe("Add login functionality");
      expect(task.status).toBe("pending");
      expect(task.createdAt).toBeGreaterThan(0);
      expect(task.updatedAt).toBe(task.createdAt);
    });

    test("creates a task with assignee and blockedBy", () => {
      const first = tm.createTask({
        subject: "Research",
        description: "Research the codebase",
        assignee: "research-expert",
      });

      const second = tm.createTask({
        subject: "Implement",
        description: "Implement the feature",
        assignee: "coding-expert",
        blockedBy: [first.id],
      });

      expect(second.assignee).toBe("coding-expert");
      expect(second.blockedBy).toEqual([first.id]);
    });

    test("generates unique IDs for each task", () => {
      const task1 = tm.createTask({ subject: "A", description: "A" });
      const task2 = tm.createTask({ subject: "B", description: "B" });
      expect(task1.id).not.toBe(task2.id);
    });
  });

  describe("updateTask", () => {
    test("updates task status", () => {
      const task = tm.createTask({
        subject: "Test task",
        description: "Testing",
      });

      const updated = tm.updateTask(task.id, { status: "in_progress" });
      expect(updated.status).toBe("in_progress");
      expect(updated.updatedAt).toBeGreaterThanOrEqual(task.createdAt);
    });

    test("updates task result", () => {
      const task = tm.createTask({
        subject: "Test task",
        description: "Testing",
      });

      const updated = tm.updateTask(task.id, {
        status: "completed",
        result: "All tests passed",
      });
      expect(updated.status).toBe("completed");
      expect(updated.result).toBe("All tests passed");
    });

    test("throws for non-existent task", () => {
      expect(() => tm.updateTask("task-999", { status: "completed" })).toThrow(
        "Task not found: task-999",
      );
    });

    test("notifies listeners on status change", () => {
      const task = tm.createTask({
        subject: "Test",
        description: "Test",
      });

      const events: Array<{ newStatus: string; oldStatus: string }> = [];
      tm.onTaskChange((t, oldStatus) => {
        events.push({ newStatus: t.status, oldStatus });
      });

      tm.updateTask(task.id, { status: "in_progress" });
      tm.updateTask(task.id, { status: "completed" });

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        newStatus: "in_progress",
        oldStatus: "pending",
      });
      expect(events[1]).toEqual({
        newStatus: "completed",
        oldStatus: "in_progress",
      });
    });
  });

  describe("getTask", () => {
    test("returns task by ID", () => {
      const created = tm.createTask({
        subject: "Find me",
        description: "Test",
      });
      const found = tm.getTask(created.id);
      expect(found).toBeDefined();
      expect(found?.subject).toBe("Find me");
    });

    test("returns undefined for non-existent task", () => {
      expect(tm.getTask("task-999")).toBeUndefined();
    });
  });

  describe("listTasks", () => {
    test("returns all tasks when no filter", () => {
      tm.createTask({ subject: "A", description: "A" });
      tm.createTask({ subject: "B", description: "B" });
      expect(tm.listTasks()).toHaveLength(2);
    });

    test("filters by status", () => {
      const task = tm.createTask({ subject: "A", description: "A" });
      tm.createTask({ subject: "B", description: "B" });
      tm.updateTask(task.id, { status: "completed" });

      const completed = tm.listTasks({ status: "completed" });
      expect(completed).toHaveLength(1);
      expect(completed[0].subject).toBe("A");
    });

    test("filters by assignee", () => {
      tm.createTask({
        subject: "A",
        description: "A",
        assignee: "coding-expert",
      });
      tm.createTask({
        subject: "B",
        description: "B",
        assignee: "research-expert",
      });

      const coding = tm.listTasks({ assignee: "coding-expert" });
      expect(coding).toHaveLength(1);
      expect(coding[0].assignee).toBe("coding-expert");
    });
  });

  describe("getDispatchableTasks", () => {
    test("returns pending tasks with no dependencies", () => {
      tm.createTask({ subject: "A", description: "A" });
      tm.createTask({ subject: "B", description: "B" });
      expect(tm.getDispatchableTasks()).toHaveLength(2);
    });

    test("excludes tasks blocked by incomplete dependencies", () => {
      const dep = tm.createTask({ subject: "Dep", description: "Dep" });
      tm.createTask({
        subject: "Blocked",
        description: "Blocked",
        blockedBy: [dep.id],
      });

      const dispatchable = tm.getDispatchableTasks();
      expect(dispatchable).toHaveLength(1);
      expect(dispatchable[0].subject).toBe("Dep");
    });

    test("includes tasks once dependencies are completed", () => {
      const dep = tm.createTask({ subject: "Dep", description: "Dep" });
      tm.createTask({
        subject: "Blocked",
        description: "Blocked",
        blockedBy: [dep.id],
      });

      tm.updateTask(dep.id, { status: "completed" });

      const dispatchable = tm.getDispatchableTasks();
      expect(dispatchable).toHaveLength(1);
      expect(dispatchable[0].subject).toBe("Blocked");
    });
  });

  describe("isAllComplete", () => {
    test("returns true when no tasks exist", () => {
      expect(tm.isAllComplete()).toBe(true);
    });

    test("returns false when tasks are pending", () => {
      tm.createTask({ subject: "A", description: "A" });
      expect(tm.isAllComplete()).toBe(false);
    });

    test("returns true when all tasks are terminal", () => {
      const t1 = tm.createTask({ subject: "A", description: "A" });
      const t2 = tm.createTask({ subject: "B", description: "B" });
      tm.updateTask(t1.id, { status: "completed" });
      tm.updateTask(t2.id, { status: "failed" });
      expect(tm.isAllComplete()).toBe(true);
    });
  });

  describe("getTaskBoardSummary", () => {
    test("returns summary for empty board", () => {
      expect(tm.getTaskBoardSummary()).toBe("No tasks on the board.");
    });

    test("returns formatted summary", () => {
      tm.createTask({
        subject: "Research API",
        description: "Investigate API design",
        assignee: "research-expert",
      });
      const summary = tm.getTaskBoardSummary();
      expect(summary).toContain("Task Board");
      expect(summary).toContain("Research API");
      expect(summary).toContain("research-expert");
    });
  });

  describe("clear", () => {
    test("removes all tasks", () => {
      tm.createTask({ subject: "A", description: "A" });
      tm.createTask({ subject: "B", description: "B" });
      tm.clear();
      expect(tm.getAllTasks()).toHaveLength(0);
    });
  });

  describe("onTaskChange", () => {
    test("returns unsubscribe function", () => {
      const task = tm.createTask({ subject: "A", description: "A" });
      const events: string[] = [];

      const unsub = tm.onTaskChange((t) => events.push(t.status));
      tm.updateTask(task.id, { status: "in_progress" });
      expect(events).toHaveLength(1);

      unsub();
      tm.updateTask(task.id, { status: "completed" });
      expect(events).toHaveLength(1); // no new event after unsubscribe
    });
  });
});
