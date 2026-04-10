/**
 * Tests for SubAgentRunner — the real expert LLM execution engine.
 */
import { describe, expect, test, vi, beforeEach } from "vitest";
import { ExpertRole } from "./types";
import { resetOrchestrator } from "./orchestrator";
import { TaskManager } from "./taskManager";

// We need to mock the modules that subAgentRunner depends on
// before importing it, to avoid filesystem access in expertRegistry.

// Mock expertRegistry
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

// Now import the module under test
import { runSubAgent, CallToolFn } from "./subAgentRunner";

// Create mock ToolExtras
function createMockExtras() {
  return {
    ide: {} as any,
    llm: {
      streamChat: vi.fn(),
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

// Create a mock callTool function
function createMockCallTool(): CallToolFn {
  return vi.fn(async (_tool, _toolCall, _extras) => ({
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

describe("runSubAgent", () => {
  test("returns error for unknown role", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    const result = await runSubAgent({
      roleName: "nonexistent-expert",
      taskDescription: "Do something",
      extras,
      callToolFn,
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("Expert role not found");
    expect(result.toolCallCount).toBe(0);
  });

  test("completes when LLM returns text without tool calls", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    // Mock streamChat to return a simple text response (async generator)
    extras.llm.streamChat = vi.fn(async function* () {
      yield {
        role: "assistant" as const,
        content: "I have completed the analysis.",
      };
    });

    const result = await runSubAgent({
      roleName: "research-expert",
      taskDescription: "Analyze the codebase",
      extras,
      callToolFn,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("I have completed the analysis.");
    expect(result.toolCallCount).toBe(0);
  });

  test("executes tool calls and continues conversation", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    let callCount = 0;
    // First call: return a tool call, second call: return final text
    extras.llm.streamChat = vi.fn(async function* () {
      if (callCount === 0) {
        callCount++;
        yield {
          role: "assistant" as const,
          content: "",
          toolCalls: [
            {
              id: "tc_1",
              type: "function" as const,
              function: {
                name: "read_file",
                arguments: '{"filepath": "src/main.ts"}',
              },
            },
          ],
        };
      } else {
        yield {
          role: "assistant" as const,
          content: "After reading the file, I found the issue.",
        };
      }
    });

    const result = await runSubAgent({
      roleName: "coding-expert",
      taskDescription: "Fix the bug",
      extras,
      callToolFn,
    });

    expect(result.success).toBe(true);
    expect(result.toolCallCount).toBe(1);
    expect(callToolFn).toHaveBeenCalledTimes(1);
  });

  test("handles tool call errors gracefully", async () => {
    const extras = createMockExtras();
    const callToolFn = vi.fn(async () => {
      throw new Error("Tool execution failed");
    }) as unknown as CallToolFn;

    let callCount = 0;
    extras.llm.streamChat = vi.fn(async function* () {
      if (callCount === 0) {
        callCount++;
        yield {
          role: "assistant" as const,
          content: "",
          toolCalls: [
            {
              id: "tc_1",
              type: "function" as const,
              function: {
                name: "read_file",
                arguments: "{}",
              },
            },
          ],
        };
      } else {
        yield {
          role: "assistant" as const,
          content: "I encountered an error.",
        };
      }
    });

    const result = await runSubAgent({
      roleName: "coding-expert",
      taskDescription: "Try something",
      extras,
      callToolFn,
    });

    // Should not throw, errors are collected
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toContain("Tool execution failed");
  });

  test("handles disallowed tool calls", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();

    let callCount = 0;
    extras.llm.streamChat = vi.fn(async function* () {
      if (callCount === 0) {
        callCount++;
        yield {
          role: "assistant" as const,
          content: "",
          toolCalls: [
            {
              id: "tc_1",
              type: "function" as const,
              function: {
                name: "not_allowed_tool",
                arguments: "{}",
              },
            },
          ],
        };
      } else {
        yield {
          role: "assistant" as const,
          content: "Done.",
        };
      }
    });

    const result = await runSubAgent({
      roleName: "coding-expert",
      taskDescription: "Do task",
      extras,
      callToolFn,
    });

    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain("not available");
    // callToolFn should NOT have been called for disallowed tool
    expect(callToolFn).not.toHaveBeenCalled();
  });

  test("respects abort signal", async () => {
    const extras = createMockExtras();
    const callToolFn = createMockCallTool();
    const abortController = new AbortController();

    // Abort before running
    abortController.abort();

    extras.llm.streamChat = vi.fn(async function* () {
      yield { role: "assistant" as const, content: "" };
    });

    const result = await runSubAgent({
      roleName: "coding-expert",
      taskDescription: "Task",
      extras,
      callToolFn,
      abortSignal: abortController.signal,
    });

    expect(result.errors).toBeDefined();
    expect(result.errors).toContain("Execution aborted by user");
  });
});
