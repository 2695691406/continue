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

  roles.set("backend-dev", {
    name: "backend-dev",
    description: "Backend developer",
    tools: ["read_file", "search_replace", "create_file"],
    systemPrompt: "You are a backend developer.",
    readonly: false,
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

  describe("addExpertStep", () => {
    test("adds a tool_call step to an expert", () => {
      const expert = orchestrator.dispatchExpert("coding-expert", "Task");
      orchestrator.addExpertStep(expert.id, {
        type: "tool_call",
        timestamp: Date.now(),
        toolName: "read_file",
        toolArgs: '{"filepath":"src/main.ts"}',
        toolResult: "File content...",
        toolSuccess: true,
      });

      const updated = orchestrator.getExpert(expert.id);
      expect(updated?.steps).toHaveLength(1);
      expect(updated?.steps?.[0].type).toBe("tool_call");
      expect(updated?.steps?.[0].toolName).toBe("read_file");
      expect(updated?.steps?.[0].toolSuccess).toBe(true);
    });

    test("adds a text step to an expert", () => {
      const expert = orchestrator.dispatchExpert("coding-expert", "Task");
      orchestrator.addExpertStep(expert.id, {
        type: "text",
        timestamp: Date.now(),
        content: "Analysis complete. The issue is in the auth module.",
      });

      const updated = orchestrator.getExpert(expert.id);
      expect(updated?.steps).toHaveLength(1);
      expect(updated?.steps?.[0].type).toBe("text");
      expect(updated?.steps?.[0].content).toContain("auth module");
    });

    test("accumulates multiple steps in order", () => {
      const expert = orchestrator.dispatchExpert("coding-expert", "Task");
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
        content: "Done",
      });

      const updated = orchestrator.getExpert(expert.id);
      expect(updated?.steps).toHaveLength(3);
      expect(updated?.steps?.[0].toolName).toBe("read_file");
      expect(updated?.steps?.[1].toolName).toBe("edit_existing_file");
      expect(updated?.steps?.[2].type).toBe("text");
    });

    test("emits expert_step event", () => {
      const events: OrchestratorEvent[] = [];
      orchestrator.onEvent((e) => events.push(e));

      const expert = orchestrator.dispatchExpert("coding-expert", "Task");
      orchestrator.addExpertStep(expert.id, {
        type: "tool_call",
        timestamp: Date.now(),
        toolName: "read_file",
        toolSuccess: true,
      });

      const stepEvents = events.filter((e) => e.type === "expert_step");
      expect(stepEvents).toHaveLength(1);
      expect(stepEvents[0].data.expertId).toBe(expert.id);
      expect(stepEvents[0].data.step.toolName).toBe("read_file");
    });

    test("silently ignores unknown expert ID", () => {
      // Should not throw
      orchestrator.addExpertStep("non-existent-id", {
        type: "text",
        timestamp: Date.now(),
        content: "test",
      });
    });

    test("steps are included in getState", () => {
      const expert = orchestrator.dispatchExpert("coding-expert", "Task");
      orchestrator.addExpertStep(expert.id, {
        type: "tool_call",
        timestamp: Date.now(),
        toolName: "grep_search",
        toolSuccess: true,
      });

      const state = orchestrator.getState();
      expect(state.experts[0].steps).toHaveLength(1);
      expect(state.experts[0].steps?.[0].toolName).toBe("grep_search");
    });

    test("dispatched expert starts with empty steps array", () => {
      const expert = orchestrator.dispatchExpert("coding-expert", "Task");
      expect(expert.steps).toEqual([]);
    });
  });

  describe("file-level conflict detection", () => {
    test("recordFileWrite tracks files per expert", () => {
      const expert = orchestrator.dispatchExpert("coding-expert", "Fix bug");
      orchestrator.recordFileWrite(expert.id, "src/auth.ts");
      orchestrator.recordFileWrite(expert.id, "src/utils.ts");

      const files = orchestrator.getExpertFileWrites(expert.id);
      expect(files.size).toBe(2);
      expect(files.has("src/auth.ts")).toBe(true);
      expect(files.has("src/utils.ts")).toBe(true);
    });

    test("getExpertFileWrites returns empty set for unknown expert", () => {
      const files = orchestrator.getExpertFileWrites("nonexistent");
      expect(files.size).toBe(0);
    });

    test("detectConflicts reports file-level conflicts", () => {
      const expertA = orchestrator.dispatchExpert("coding-expert", "Fix auth");
      const expertB = orchestrator.dispatchExpert("backend-dev", "Fix API");

      orchestrator.recordFileWrite(expertA.id, "src/auth.ts");
      orchestrator.recordFileWrite(expertB.id, "src/auth.ts"); // same file

      const conflicts = orchestrator.detectConflicts();
      // Should have role-level conflict + file-level conflict
      expect(conflicts.some((c) => c.includes("File conflict"))).toBe(true);
      expect(conflicts.some((c) => c.includes("src/auth.ts"))).toBe(true);
    });

    test("no file conflict when experts write different files", () => {
      const expertA = orchestrator.dispatchExpert("coding-expert", "Fix auth");
      const expertB = orchestrator.dispatchExpert("backend-dev", "Fix API");

      orchestrator.recordFileWrite(expertA.id, "src/auth.ts");
      orchestrator.recordFileWrite(expertB.id, "src/api.ts");

      const conflicts = orchestrator.detectConflicts();
      // Should still have role-level conflict but no file-level
      expect(conflicts.some((c) => c.includes("File conflict"))).toBe(false);
    });

    test("no file conflict for read-only experts", () => {
      orchestrator.dispatchExpert("research-expert", "Research auth");
      orchestrator.dispatchExpert("verify-expert", "Verify auth");

      const conflicts = orchestrator.detectConflicts();
      expect(conflicts).toHaveLength(0);
    });

    test("reset clears file tracking", () => {
      const expert = orchestrator.dispatchExpert("coding-expert", "Fix bug");
      orchestrator.recordFileWrite(expert.id, "src/auth.ts");

      orchestrator.reset();

      const files = orchestrator.getExpertFileWrites(expert.id);
      expect(files.size).toBe(0);
    });
  });
});
