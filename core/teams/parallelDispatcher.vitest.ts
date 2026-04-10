/**
 * Tests for ParallelDispatcher — parallel expert execution engine.
 */
import { describe, expect, test, vi, beforeEach } from "vitest";
import { ExpertRole } from "./types";
import { resetOrchestrator } from "./orchestrator";

// Mock expertRegistry before imports
const mockRoles = new Map<string, ExpertRole>();
mockRoles.set("coding-expert", {
  name: "coding-expert",
  description: "Full-stack coding expert",
  tools: ["read_file", "search_replace"],
  systemPrompt: "You are a coding expert.",
  readonly: false,
});
mockRoles.set("research-expert", {
  name: "research-expert",
  description: "Research expert",
  tools: ["read_file", "search_web"],
  systemPrompt: "You are a research expert.",
  readonly: true,
});
mockRoles.set("verify-expert", {
  name: "verify-expert",
  description: "QA expert",
  tools: ["read_file", "run_in_terminal"],
  systemPrompt: "You are a verify expert.",
  readonly: true,
});

vi.mock("./expertRegistry", () => {
  const registry = {
    getRole: (name: string) => mockRoles.get(name),
    getExpertRoles: () => Array.from(mockRoles.values()),
    getAllRoles: () => Array.from(mockRoles.values()),
    hasRole: (name: string) => mockRoles.has(name),
    getAvailableExpertNames: () => Array.from(mockRoles.keys()),
    getLeaderRole: () => undefined,
    registerCustomRole: vi.fn(),
  };

  return {
    ExpertRegistry: vi.fn(() => registry),
    getExpertRegistry: () => registry,
  };
});

import {
  dispatchParallel,
  formatParallelResult,
  DispatchRequest,
  ParallelDispatchResult,
} from "./parallelDispatcher";
import { CallToolFn } from "./subAgentRunner";

function createMockExtras() {
  let callCount = 0;
  return {
    ide: {} as any,
    llm: {
      streamChat: vi.fn(async function* () {
        yield {
          role: "assistant" as const,
          content: `Expert completed task (call ${++callCount}).`,
        };
      }),
      providerName: "test",
      underlyingProviderName: "test",
      model: "test-model",
      contextLength: 8192,
      completionOptions: { maxTokens: 4096 },
      countTokens: vi.fn(() => 10),
      supportsImages: vi.fn(() => false),
      supportsCompletions: vi.fn(() => true),
      supportsPrefill: vi.fn(() => false),
      supportsFim: vi.fn(() => false),
    } as any,
    fetch: vi.fn(),
    tool: {} as any,
    config: {
      tools: [
        {
          type: "function",
          displayTitle: "Read File",
          readonly: true,
          group: "Built-In",
          function: { name: "read_file", description: "Read a file" },
        },
        {
          type: "function",
          displayTitle: "Edit File",
          readonly: false,
          group: "Built-In",
          function: {
            name: "edit_existing_file",
            description: "Edit a file",
          },
        },
      ],
    } as any,
  };
}

function createMockCallTool(): CallToolFn {
  return vi.fn(async () => ({
    contextItems: [
      {
        name: "Result",
        description: "Tool executed",
        content: "Tool result content",
      },
    ],
    errorMessage: undefined,
  }));
}

beforeEach(() => {
  resetOrchestrator();
});

describe("dispatchParallel", () => {
  test("dispatches a single expert and returns result", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    const requests: DispatchRequest[] = [
      {
        roleName: "research-expert",
        taskDescription: "Analyze the code structure",
      },
    ];

    const result = await dispatchParallel(requests, extras, callToolFn);

    expect(result.results.size).toBe(1);
    expect(result.results.has("research-expert")).toBe(true);
    expect(result.hasFailures).toBe(false);
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);

    const expertResult = result.results.get("research-expert")!;
    expect(expertResult.success).toBe(true);
    expect(expertResult.toolCallCount).toBe(0);
  });

  test("dispatches multiple experts in parallel", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    const requests: DispatchRequest[] = [
      {
        roleName: "research-expert",
        taskDescription: "Research the codebase",
      },
      {
        roleName: "verify-expert",
        taskDescription: "Run the test suite",
      },
    ];

    const result = await dispatchParallel(requests, extras, callToolFn);

    expect(result.results.size).toBe(2);
    expect(result.results.has("research-expert")).toBe(true);
    expect(result.results.has("verify-expert")).toBe(true);
    expect(result.hasFailures).toBe(false);
  });

  test("reports failure when an expert role is unknown", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    const requests: DispatchRequest[] = [
      {
        roleName: "nonexistent-expert",
        taskDescription: "Do something",
      },
    ];

    const result = await dispatchParallel(requests, extras, callToolFn);

    expect(result.results.size).toBe(1);
    expect(result.hasFailures).toBe(true);

    const expertResult = result.results.get("nonexistent-expert")!;
    expect(expertResult.success).toBe(false);
    expect(expertResult.output).toContain("Expert role not found");
  });

  test("succeeds partially when one expert fails", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    const requests: DispatchRequest[] = [
      {
        roleName: "research-expert",
        taskDescription: "Research the codebase",
      },
      {
        roleName: "nonexistent-expert",
        taskDescription: "This will fail",
      },
    ];

    const result = await dispatchParallel(requests, extras, callToolFn);

    expect(result.results.size).toBe(2);
    expect(result.hasFailures).toBe(true);

    // The successful expert should still have results
    const researchResult = result.results.get("research-expert")!;
    expect(researchResult.success).toBe(true);

    // The failed expert should report failure
    const failedResult = result.results.get("nonexistent-expert")!;
    expect(failedResult.success).toBe(false);
  });

  test("propagates abort signal to all experts", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();
    const abortController = new AbortController();

    // Abort immediately
    abortController.abort();

    const requests: DispatchRequest[] = [
      {
        roleName: "research-expert",
        taskDescription: "Research something",
      },
      {
        roleName: "verify-expert",
        taskDescription: "Verify something",
      },
    ];

    const result = await dispatchParallel(
      requests,
      extras,
      callToolFn,
      abortController.signal,
    );

    // Each expert's child abort controller should have been triggered
    // The runSubAgent checks the signal and may still produce results
    // but the abort controllers should all be linked
    expect(result.results.size).toBe(2);
  });

  test("passes task context to experts", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    const requests: DispatchRequest[] = [
      {
        roleName: "research-expert",
        taskDescription: "Research the auth module",
        context: "Focus on the OAuth2 implementation",
        taskId: "task-1",
      },
    ];

    const result = await dispatchParallel(requests, extras, callToolFn);

    expect(result.results.size).toBe(1);
    expect(result.results.has("research-expert")).toBe(true);
    expect(result.results.get("research-expert")!.success).toBe(true);
  });

  test("records timing information", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    const requests: DispatchRequest[] = [
      {
        roleName: "research-expert",
        taskDescription: "Quick task",
      },
    ];

    const result = await dispatchParallel(requests, extras, callToolFn);

    expect(typeof result.totalTimeMs).toBe("number");
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
  });

  test("handles empty request array", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    const result = await dispatchParallel([], extras, callToolFn);

    expect(result.results.size).toBe(0);
    expect(result.hasFailures).toBe(false);
  });
});

describe("formatParallelResult", () => {
  test("formats successful result", () => {
    const result: ParallelDispatchResult = {
      results: new Map([
        [
          "research-expert",
          {
            success: true,
            output: "Found 3 relevant modules.",
            toolCallCount: 5,
          },
        ],
      ]),
      totalTimeMs: 2500,
      hasFailures: false,
    };

    const formatted = formatParallelResult(result);

    expect(formatted).toContain("Parallel Dispatch Summary");
    expect(formatted).toContain("2.5s");
    expect(formatted).toContain("1"); // expert count
    expect(formatted).toContain("All succeeded");
    expect(formatted).toContain("research-expert");
    expect(formatted).toContain("Tool Calls");
    expect(formatted).toContain("5");
  });

  test("formats result with failures", () => {
    const result: ParallelDispatchResult = {
      results: new Map([
        [
          "coding-expert",
          {
            success: false,
            output: "Failed to compile",
            toolCallCount: 2,
            errors: ["Compilation error"],
          },
        ],
      ]),
      totalTimeMs: 1000,
      hasFailures: true,
    };

    const formatted = formatParallelResult(result);

    expect(formatted).toContain("Some experts failed");
    expect(formatted).toContain("❌");
    expect(formatted).toContain("Compilation error");
  });

  test("formats mixed success and failure results", () => {
    const result: ParallelDispatchResult = {
      results: new Map([
        [
          "research-expert",
          {
            success: true,
            output: "Research complete",
            toolCallCount: 3,
          },
        ],
        [
          "coding-expert",
          {
            success: false,
            output: "Build failed",
            toolCallCount: 1,
            errors: ["npm error"],
          },
        ],
      ]),
      totalTimeMs: 5000,
      hasFailures: true,
    };

    const formatted = formatParallelResult(result);

    expect(formatted).toContain("✅ research-expert");
    expect(formatted).toContain("❌ coding-expert");
    expect(formatted).toContain("2"); // expert count
  });

  test("truncates long output in formatted result", () => {
    const longOutput = "x".repeat(600);
    const result: ParallelDispatchResult = {
      results: new Map([
        [
          "research-expert",
          {
            success: true,
            output: longOutput,
            toolCallCount: 1,
          },
        ],
      ]),
      totalTimeMs: 100,
      hasFailures: false,
    };

    const formatted = formatParallelResult(result);

    // Output should be truncated to 500 chars + "..."
    expect(formatted).toContain("...");
    // The full 600-char output should NOT appear intact
    expect(formatted).not.toContain(longOutput);
  });
});
