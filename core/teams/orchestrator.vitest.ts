import { describe, expect, test, beforeEach } from "vitest";
import { TeamsOrchestrator } from "./orchestrator";
import { TaskManager } from "./taskManager";
import { ExpertRegistry } from "./expertRegistry";
import { ExpertRole } from "./types";
import { OrchestratorEvent } from "./orchestrator";

// Create a mock registry that doesn't depend on filesystem
function createMockRegistry(): ExpertRegistry {
  const registry = Object.create(ExpertRegistry.prototype) as ExpertRegistry;
  const roles = new Map<string, ExpertRole>();

  roles.set("coding-expert", {
    name: "coding-expert",
    description: "Full-stack coding expert",
    tools: ["read_file", "search_replace", "create_file"],
    systemPrompt: "You are a coding expert.",
    readonly: false,
  });

  roles.set("research-expert", {
    name: "research-expert",
    description: "Research and analysis expert",
    tools: ["read_file", "grep_code", "search_file"],
    systemPrompt: "You are a research expert.",
    readonly: true,
  });

  roles.set("verify-expert", {
    name: "verify-expert",
    description: "Verification expert",
    tools: ["read_file", "run_in_terminal"],
    systemPrompt: "You are a verify expert.",
    readonly: true,
  });

  // Inject the roles map using Object.defineProperty
  Object.defineProperty(registry, "roles", { value: roles, writable: true });

  // Override methods to use our mock roles
  registry.getRole = (name: string) => roles.get(name);
  registry.hasRole = (name: string) => roles.has(name);
  registry.getExpertRoles = () => Array.from(roles.values());
  registry.getAllRoles = () => Array.from(roles.values());
  registry.getAvailableExpertNames = () => Array.from(roles.keys());

  return registry;
}

describe("TeamsOrchestrator", () => {
  let orchestrator: TeamsOrchestrator;
  let taskManager: TaskManager;
  let registry: ExpertRegistry;

  beforeEach(() => {
    taskManager = new TaskManager();
    registry = createMockRegistry();
    orchestrator = new TeamsOrchestrator(taskManager, registry);
  });

  describe("dispatchExpert", () => {
    test("creates and tracks an expert instance", () => {
      const expert = orchestrator.dispatchExpert(
        "coding-expert",
        "Implement login feature",
      );

      expect(expert.id).toContain("coding-expert");
      expect(expert.role.name).toBe("coding-expert");
      expect(expert.status).toBe("working");
    });

    test("throws for unknown role", () => {
      expect(() =>
        orchestrator.dispatchExpert("unknown-expert", "Some task"),
      ).toThrow("Expert role not found: unknown-expert");
    });

    test("emits expert_dispatched event", () => {
      const events: OrchestratorEvent[] = [];
      orchestrator.onEvent((e) => events.push(e));

      orchestrator.dispatchExpert("coding-expert", "Task");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("expert_dispatched");
    });
  });

  describe("completeExpert", () => {
    test("marks expert as completed with result", () => {
      const expert = orchestrator.dispatchExpert("coding-expert", "Task");
      orchestrator.completeExpert(expert.id, "Done");

      const updated = orchestrator.getExpert(expert.id);
      expect(updated?.status).toBe("completed");
      expect(updated?.result).toBe("Done");
    });

    test("throws for non-existent expert", () => {
      expect(() => orchestrator.completeExpert("fake-id", "Done")).toThrow(
        "Expert instance not found: fake-id",
      );
    });

    test("emits expert_completed event", () => {
      const events: OrchestratorEvent[] = [];
      orchestrator.onEvent((e) => events.push(e));

      const expert = orchestrator.dispatchExpert("coding-expert", "Task");
      orchestrator.completeExpert(expert.id, "Done");

      expect(events.filter((e) => e.type === "expert_completed")).toHaveLength(
        1,
      );
    });
  });

  describe("failExpert", () => {
    test("marks expert as failed with error", () => {
      const expert = orchestrator.dispatchExpert("coding-expert", "Task");
      orchestrator.failExpert(expert.id, "Something went wrong");

      const updated = orchestrator.getExpert(expert.id);
      expect(updated?.status).toBe("failed");
      expect(updated?.result).toContain("Something went wrong");
    });
  });

  describe("sendMessage", () => {
    test("records message and emits event", () => {
      const events: OrchestratorEvent[] = [];
      orchestrator.onEvent((e) => events.push(e));

      orchestrator.sendMessage("leader", "coding-expert", "Please review");

      const state = orchestrator.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].from).toBe("leader");
      expect(state.messages[0].to).toBe("coding-expert");
      expect(state.messages[0].content).toBe("Please review");
      expect(events.filter((e) => e.type === "message_sent")).toHaveLength(1);
    });
  });

  describe("getActiveExperts", () => {
    test("returns only working experts", () => {
      const e1 = orchestrator.dispatchExpert("coding-expert", "Task 1");
      orchestrator.dispatchExpert("research-expert", "Task 2");
      orchestrator.completeExpert(e1.id, "Done");

      const active = orchestrator.getActiveExperts();
      expect(active).toHaveLength(1);
      expect(active[0].role.name).toBe("research-expert");
    });
  });

  describe("hasActiveExperts", () => {
    test("returns false when no experts dispatched", () => {
      expect(orchestrator.hasActiveExperts()).toBe(false);
    });

    test("returns true when experts are working", () => {
      orchestrator.dispatchExpert("coding-expert", "Task");
      expect(orchestrator.hasActiveExperts()).toBe(true);
    });
  });

  describe("detectConflicts", () => {
    test("detects potential conflicts between write-capable experts", () => {
      orchestrator.dispatchExpert("coding-expert", "Task 1");
      // Dispatch a second write-capable expert - normally would be another coding expert
      // but our mock only has one. We test with the same role dispatched twice.
      orchestrator.dispatchExpert("coding-expert", "Task 2");

      const conflicts = orchestrator.detectConflicts();
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0]).toContain("Potential conflict");
    });

    test("no conflict for read-only + write experts", () => {
      orchestrator.dispatchExpert("coding-expert", "Task 1");
      orchestrator.dispatchExpert("research-expert", "Task 2");

      const conflicts = orchestrator.detectConflicts();
      expect(conflicts).toHaveLength(0);
    });
  });

  describe("getState", () => {
    test("returns full orchestrator state", () => {
      orchestrator.dispatchExpert("coding-expert", "Task 1");
      taskManager.createTask({ subject: "Build", description: "Build feature" });

      const state = orchestrator.getState();
      expect(state.experts).toHaveLength(1);
      expect(state.tasks).toHaveLength(1);
      expect(state.messages).toHaveLength(0);
      expect(state.isOrchestratorRunning).toBe(false);
    });
  });

  describe("reset", () => {
    test("clears all state", () => {
      orchestrator.dispatchExpert("coding-expert", "Task");
      orchestrator.sendMessage("leader", "coding-expert", "Hello");
      taskManager.createTask({ subject: "A", description: "A" });

      orchestrator.reset();

      const state = orchestrator.getState();
      expect(state.experts).toHaveLength(0);
      expect(state.tasks).toHaveLength(0);
      expect(state.messages).toHaveLength(0);
    });
  });

  describe("onEvent", () => {
    test("returns unsubscribe function", () => {
      const events: OrchestratorEvent[] = [];
      const unsub = orchestrator.onEvent((e) => events.push(e));

      orchestrator.dispatchExpert("coding-expert", "Task 1");
      expect(events).toHaveLength(1);

      unsub();
      orchestrator.dispatchExpert("research-expert", "Task 2");
      expect(events).toHaveLength(1); // no new events
    });
  });
});
