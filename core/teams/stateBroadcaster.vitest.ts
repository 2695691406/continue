/**
 * Tests for TeamsStateBroadcaster — bridges orchestrator events to GUI.
 */
import { describe, expect, test, vi, beforeEach } from "vitest";
import { TeamsStateBroadcaster, TeamsStateUpdatePayload } from "./stateBroadcaster";
import { TeamsOrchestrator, resetOrchestrator } from "./orchestrator";
import { TaskManager } from "./taskManager";
import { ExpertRegistry } from "./expertRegistry";
import { ExpertRole } from "./types";

// Create a mock registry (avoids filesystem reads)
function createMockRegistry(): ExpertRegistry {
  const roles = new Map<string, ExpertRole>();
  roles.set("coding-expert", {
    name: "coding-expert",
    description: "Coder",
    tools: ["read_file"],
    systemPrompt: "Code expert",
  });
  roles.set("research-expert", {
    name: "research-expert",
    description: "Researcher",
    tools: ["search_web"],
    systemPrompt: "Research expert",
    readonly: true,
  });

  return {
    getRole: (name: string) => roles.get(name),
    getExpertRoles: () =>
      Array.from(roles.values()).filter((r) => r.name !== "leader"),
    getAllRoles: () => Array.from(roles.values()),
    hasRole: (name: string) => roles.has(name),
    getAvailableExpertNames: () => Array.from(roles.keys()),
    getLeaderRole: () => undefined,
    registerCustomRole: vi.fn(),
  } as unknown as ExpertRegistry;
}

describe("TeamsStateBroadcaster", () => {
  let taskManager: TaskManager;
  let orchestrator: TeamsOrchestrator;
  let sendFn: ReturnType<typeof vi.fn>;
  let broadcaster: TeamsStateBroadcaster;

  beforeEach(() => {
    resetOrchestrator();
    taskManager = new TaskManager();
    const registry = createMockRegistry();
    orchestrator = new TeamsOrchestrator(taskManager, registry);
    sendFn = vi.fn();
    broadcaster = new TeamsStateBroadcaster(orchestrator, taskManager, sendFn);
  });

  test("sends initial state on start", () => {
    broadcaster.start();

    expect(sendFn).toHaveBeenCalledTimes(1);
    const payload: TeamsStateUpdatePayload = sendFn.mock.calls[0][0];
    expect(payload.experts).toEqual([]);
    expect(payload.tasks).toEqual([]);
    expect(payload.isOrchestratorRunning).toBe(false);
  });

  test("broadcasts when expert is dispatched", () => {
    broadcaster.start();
    sendFn.mockClear();

    orchestrator.dispatchExpert("coding-expert", "Fix bug");

    expect(sendFn).toHaveBeenCalledTimes(1);
    const payload: TeamsStateUpdatePayload = sendFn.mock.calls[0][0];
    expect(payload.experts).toHaveLength(1);
    expect(payload.experts[0].roleName).toBe("coding-expert");
    expect(payload.experts[0].status).toBe("working");
  });

  test("broadcasts when expert completes", () => {
    broadcaster.start();
    const expert = orchestrator.dispatchExpert("coding-expert", "Fix bug");
    sendFn.mockClear();

    orchestrator.completeExpert(expert.id, "Bug fixed");

    expect(sendFn).toHaveBeenCalledTimes(1);
    const payload: TeamsStateUpdatePayload = sendFn.mock.calls[0][0];
    expect(payload.experts[0].status).toBe("completed");
  });

  test("broadcasts when expert fails", () => {
    broadcaster.start();
    const expert = orchestrator.dispatchExpert("coding-expert", "Fix bug");
    sendFn.mockClear();

    orchestrator.failExpert(expert.id, "LLM error");

    expect(sendFn).toHaveBeenCalledTimes(1);
    const payload: TeamsStateUpdatePayload = sendFn.mock.calls[0][0];
    expect(payload.experts[0].status).toBe("failed");
  });

  test("broadcasts when task is created", () => {
    broadcaster.start();
    sendFn.mockClear();

    taskManager.createTask({
      subject: "Implement login",
      description: "Create login form",
      assignee: "coding-expert",
    });

    // Task creation doesn't trigger onTaskChange (only status changes do)
    // The broadcaster picks it up through orchestrator events or explicit broadcast
    broadcaster.broadcast();
    expect(sendFn).toHaveBeenCalled();
    const payload: TeamsStateUpdatePayload =
      sendFn.mock.calls[sendFn.mock.calls.length - 1][0];
    expect(payload.tasks).toHaveLength(1);
    expect(payload.tasks[0].subject).toBe("Implement login");
  });

  test("broadcasts when task status changes", () => {
    broadcaster.start();
    const task = taskManager.createTask({
      subject: "Research",
      description: "Research topic",
    });
    sendFn.mockClear();

    taskManager.updateTask(task.id, { status: "completed" });

    expect(sendFn).toHaveBeenCalledTimes(1);
    const payload: TeamsStateUpdatePayload = sendFn.mock.calls[0][0];
    expect(payload.tasks[0].status).toBe("completed");
  });

  test("does not broadcast after stop", () => {
    broadcaster.start();
    broadcaster.stop();
    sendFn.mockClear();

    orchestrator.dispatchExpert("coding-expert", "Fix bug");
    taskManager.createTask({ subject: "Task", description: "Desc" });

    expect(sendFn).not.toHaveBeenCalled();
  });

  test("does not broadcast before start", () => {
    orchestrator.dispatchExpert("coding-expert", "Fix bug");
    expect(sendFn).not.toHaveBeenCalled();
  });

  test("can restart after stop", () => {
    broadcaster.start();
    broadcaster.stop();
    sendFn.mockClear();

    broadcaster.start();
    expect(sendFn).toHaveBeenCalledTimes(1); // Initial state broadcast
  });

  test("payload includes expert currentTaskSubject", () => {
    broadcaster.start();

    const task = taskManager.createTask({
      subject: "Build API endpoint",
      description: "REST API",
    });

    orchestrator.dispatchExpert("coding-expert", "Build API", undefined, task.id);
    const payload: TeamsStateUpdatePayload =
      sendFn.mock.calls[sendFn.mock.calls.length - 1][0];
    expect(payload.experts[0].currentTaskSubject).toBe("Build API endpoint");
  });

  test("payload includes task assignee", () => {
    broadcaster.start();
    taskManager.createTask({
      subject: "Research",
      description: "Research topic",
      assignee: "research-expert",
    });

    broadcaster.broadcast();
    const payload: TeamsStateUpdatePayload =
      sendFn.mock.calls[sendFn.mock.calls.length - 1][0];
    expect(payload.tasks[0].assignee).toBe("research-expert");
  });

  test("broadcasts when expert step is added", () => {
    broadcaster.start();
    const expert = orchestrator.dispatchExpert("coding-expert", "Fix bug");
    sendFn.mockClear();

    orchestrator.addExpertStep(expert.id, {
      type: "tool_call",
      timestamp: Date.now(),
      toolName: "read_file",
      toolSuccess: true,
    });

    expect(sendFn).toHaveBeenCalledTimes(1);
    const payload: TeamsStateUpdatePayload = sendFn.mock.calls[0][0];
    expect(payload.experts[0].steps).toHaveLength(1);
    expect(payload.experts[0].steps?.[0].toolName).toBe("read_file");
  });

  test("payload includes multiple steps in order", () => {
    broadcaster.start();
    const expert = orchestrator.dispatchExpert("coding-expert", "Fix bug");
    sendFn.mockClear();

    orchestrator.addExpertStep(expert.id, {
      type: "tool_call",
      timestamp: 1000,
      toolName: "read_file",
      toolSuccess: true,
    });
    orchestrator.addExpertStep(expert.id, {
      type: "tool_call",
      timestamp: 2000,
      toolName: "edit_existing_file",
      toolSuccess: true,
    });
    orchestrator.addExpertStep(expert.id, {
      type: "text",
      timestamp: 3000,
      content: "Done fixing the bug",
    });

    const payload: TeamsStateUpdatePayload =
      sendFn.mock.calls[sendFn.mock.calls.length - 1][0];
    expect(payload.experts[0].steps).toHaveLength(3);
    expect(payload.experts[0].steps?.[0].toolName).toBe("read_file");
    expect(payload.experts[0].steps?.[1].toolName).toBe("edit_existing_file");
    expect(payload.experts[0].steps?.[2].type).toBe("text");
  });
});
