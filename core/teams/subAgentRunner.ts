/**
 * SubAgentRunner - Executes an expert agent as an independent LLM session.
 *
 * Creates a conversation with the expert's system prompt and restricted tool set,
 * runs a tool-call loop until the expert completes its work, and returns
 * the collected results to the Leader.
 *
 * The tool-call loop mirrors Continue's agent mode execution but scoped to:
 * - The expert's filtered tool set (per role permissions)
 * - The expert's system prompt (role prompt + delegation contract)
 * - An independent message history (context isolation)
 */

import {
  ChatMessage,
  ContextItem,
  ILLM,
  McpUiState,
  Tool,
  ToolCall,
  ToolExtras,
} from "..";
import {
  ExpertExecutor,
  ExpertExecutionResult,
} from "./expertExecutor";
import { DelegationContract } from "./types";
import { getExpertRegistry } from "./expertRegistry";
import { getOrchestrator } from "./orchestrator";

/** Maximum number of tool-call rounds for a single expert session */
const MAX_TOOL_ROUNDS = 25;

/** Maximum accumulated output length (characters) before truncation */
const MAX_OUTPUT_LENGTH = 50000;

/** Default timeout for a single expert session (5 minutes) */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Default max retry attempts for a failed expert */
const DEFAULT_MAX_RETRIES = 0;

/**
 * Type for the callTool function, injected to avoid circular dependencies.
 * This matches the signature of core/tools/callTool.ts callTool().
 */
export type CallToolFn = (
  tool: Tool,
  toolCall: ToolCall,
  extras: ToolExtras,
) => Promise<{
  contextItems: ContextItem[];
  errorMessage: string | undefined;
  errorReason?: string;
  mcpUiState?: McpUiState;
}>;

/**
 * Run a sub-agent LLM session for an expert role.
 *
 * This is the real execution engine that replaces the previous stub.
 * It creates an independent conversation with the expert's system prompt,
 * sends the task as a user message, and runs a tool-call loop
 * until the expert produces a final text response (no more tool calls).
 *
 * @param callToolFn - Injected callTool function to avoid circular dependency
 */
export async function runSubAgent(params: {
  roleName: string;
  taskDescription: string;
  context?: string;
  taskId?: string;
  extras: ToolExtras;
  callToolFn: CallToolFn;
  abortSignal?: AbortSignal;
  /** Timeout in ms. Defaults to 5 minutes. Set 0 to disable. */
  timeoutMs?: number;
}): Promise<ExpertExecutionResult> {
  const {
    roleName,
    taskDescription,
    context,
    taskId,
    extras,
    callToolFn,
    abortSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params;

  const registry = getExpertRegistry();
  const role = registry.getRole(roleName);
  if (!role) {
    return {
      success: false,
      output: `Expert role not found: ${roleName}`,
      toolCallCount: 0,
      errors: [`Role "${roleName}" is not registered`],
    };
  }

  // Build the delegation contract
  const contract: DelegationContract = {
    taskObjective: taskDescription,
    context,
    acceptanceCriteria: taskId
      ? `When complete, update task ${taskId} status to 'completed' using TaskUpdate.`
      : undefined,
  };

  // Create the expert executor for prompt and tool filtering
  const executor = new ExpertExecutor(role, contract, extras.config.tools, {
    workspacePath: undefined, // Could be injected from IDE
  });

  const systemPrompt = executor.getSystemPrompt();
  const allowedTools = executor.getTools();

  // Build the tool definitions for the LLM (OpenAI format)
  const toolDefs: Tool[] = allowedTools.filter(
    (t) => t.function.name !== undefined,
  );

  // Initialize the conversation
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: buildExpertUserMessage(taskDescription, context),
    },
  ];

  const llm = extras.llm;

  // Chain abort signals: timeout + user-provided
  const timeoutController = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs > 0) {
    timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);
  }
  if (abortSignal) {
    if (abortSignal.aborted) {
      timeoutController.abort();
    } else {
      abortSignal.addEventListener("abort", () => timeoutController.abort());
    }
  }
  const signal = timeoutController.signal;

  // Track execution metrics
  let toolCallCount = 0;
  const errors: string[] = [];
  const outputParts: string[] = [];

  // Update orchestrator state
  const orchestrator = getOrchestrator();
  const expertInstance = orchestrator.dispatchExpert(
    roleName,
    taskDescription,
    context,
    taskId,
  );

  try {
    // Tool-call loop: send messages → collect response → handle tool calls → repeat
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (signal.aborted) {
        const reason = timeoutMs > 0 && !abortSignal?.aborted
          ? `Execution timed out after ${Math.round(timeoutMs / 1000)}s`
          : "Execution aborted by user";
        errors.push(reason);
        break;
      }

      // Stream the LLM response
      const assistantResponse = await collectStreamedResponse(
        llm,
        messages,
        signal,
        toolDefs,
      );

      // Add the assistant response to the conversation
      messages.push(assistantResponse);

      // Check if there are tool calls to process
      const toolCalls = assistantResponse.toolCalls?.filter(
        (tc) => tc.id && tc.function?.name,
      );

      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls = expert is done, collect final text
        const finalText =
          typeof assistantResponse.content === "string"
            ? assistantResponse.content
            : "";
        if (finalText) {
          outputParts.push(finalText);

          // Emit a text step for the final response
          orchestrator.addExpertStep(expertInstance.id, {
            type: "text",
            timestamp: Date.now(),
            content: finalText.slice(0, 1000),
          });
        }
        break;
      }

      // Process each tool call
      for (const toolCallDelta of toolCalls) {
        if (signal.aborted) break;

        const toolName = toolCallDelta.function?.name;
        const toolArgsStr = toolCallDelta.function?.arguments || "{}";
        const toolCallId = toolCallDelta.id || `tc_${toolCallCount}`;

        if (!toolName) continue;

        toolCallCount++;

        // Find the matching tool definition
        const tool = toolDefs.find((t) => t.function.name === toolName);
        if (!tool) {
          // Tool not allowed for this expert
          const errorMsg = `Tool "${toolName}" is not available for ${roleName}`;
          errors.push(errorMsg);
          messages.push({
            role: "tool",
            content: errorMsg,
            toolCallId,
          });

          // Emit step for disallowed tool
          orchestrator.addExpertStep(expertInstance.id, {
            type: "tool_call",
            timestamp: Date.now(),
            toolName,
            toolArgs: toolArgsStr,
            toolResult: errorMsg,
            toolSuccess: false,
          });
          continue;
        }

        // Execute the tool via the injected callTool function
        try {
          const result = await callToolFn(
            tool,
            {
              id: toolCallId,
              type: "function",
              function: { name: toolName, arguments: toolArgsStr },
            },
            extras,
          );

          // Format tool result as message
          const resultContent = result.contextItems
            .map((item) => {
              if (item.content) return item.content;
              return `${item.name}: ${item.description || ""}`;
            })
            .join("\n\n");

          messages.push({
            role: "tool",
            content: resultContent || "Tool executed successfully.",
            toolCallId,
          });

          // Collect tool output for the summary
          if (result.contextItems.length > 0) {
            const toolOutput = result.contextItems
              .map((item) => `[${toolName}] ${item.name}: ${item.description || ""}`)
              .join("\n");
            outputParts.push(toolOutput);
          }

          // Emit step for successful tool call
          const hasError = !!result.errorMessage;
          orchestrator.addExpertStep(expertInstance.id, {
            type: "tool_call",
            timestamp: Date.now(),
            toolName,
            toolArgs: toolArgsStr,
            toolResult: resultContent?.slice(0, 500) || "OK",
            toolSuccess: !hasError,
          });

          // Check for errors from tool execution
          if (result.errorMessage) {
            errors.push(`${toolName}: ${result.errorMessage}`);
          }
        } catch (e: any) {
          const errorMsg = `Tool ${toolName} failed: ${e.message || String(e)}`;
          errors.push(errorMsg);
          messages.push({
            role: "tool",
            content: errorMsg,
            toolCallId,
          });

          // Emit step for failed tool call
          orchestrator.addExpertStep(expertInstance.id, {
            type: "tool_call",
            timestamp: Date.now(),
            toolName,
            toolArgs: toolArgsStr,
            toolResult: errorMsg,
            toolSuccess: false,
          });
        }
      }

      // Safety: truncate output if too long
      const totalOutput = outputParts.join("\n").length;
      if (totalOutput > MAX_OUTPUT_LENGTH) {
        errors.push(
          `Output truncated at ${MAX_OUTPUT_LENGTH} characters`,
        );
        break;
      }
    }

    // Mark expert as completed
    const finalOutput = outputParts.join("\n\n").slice(0, MAX_OUTPUT_LENGTH);
    orchestrator.completeExpert(expertInstance.id, finalOutput);

    if (timeoutHandle) clearTimeout(timeoutHandle);

    return {
      success: errors.length === 0,
      output: finalOutput || "Expert completed without producing output.",
      toolCallCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (e: any) {
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const errorMsg = e.message || String(e);
    orchestrator.failExpert(expertInstance.id, errorMsg);
    return {
      success: false,
      output: `Expert ${roleName} failed: ${errorMsg}`,
      toolCallCount,
      errors: [...errors, errorMsg],
    };
  }
}

/**
 * Collect a full streamed response from the LLM into a single ChatMessage.
 * Handles both text content and tool calls.
 */
async function collectStreamedResponse(
  llm: ILLM,
  messages: ChatMessage[],
  signal: AbortSignal,
  tools: Tool[],
): Promise<ChatMessage> {
  const contentParts: string[] = [];
  const toolCallMap = new Map<
    string,
    { id: string; name: string; arguments: string }
  >();

  const completionOptions = tools.length > 0 ? { tools } : {};

  const generator = llm.streamChat(messages, signal, completionOptions);

  for await (const chunk of generator) {
    // Collect text content
    if (typeof chunk.content === "string" && chunk.content) {
      contentParts.push(chunk.content);
    } else if (Array.isArray(chunk.content)) {
      for (const part of chunk.content) {
        if ("text" in part && part.text) {
          contentParts.push(part.text);
        }
      }
    }

    // Collect tool calls (may come in deltas)
    if (chunk.toolCalls) {
      for (const tc of chunk.toolCalls) {
        if (tc.id) {
          const existing = toolCallMap.get(tc.id);
          if (existing) {
            // Append arguments delta
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            toolCallMap.set(tc.id, {
              id: tc.id,
              name: tc.function?.name || "",
              arguments: tc.function?.arguments || "",
            });
          }
        }
      }
    }
  }

  // Build the response message
  const toolCalls =
    toolCallMap.size > 0
      ? Array.from(toolCallMap.values()).map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }))
      : undefined;

  return {
    role: "assistant",
    content: contentParts.join(""),
    toolCalls,
  };
}

/**
 * Build the initial user message for the expert's conversation.
 */
function buildExpertUserMessage(
  taskDescription: string,
  context?: string,
): string {
  let message = taskDescription;
  if (context) {
    message += `\n\n## Additional Context\n\n${context}`;
  }
  return message;
}

/**
 * Run a sub-agent with automatic retry on failure.
 *
 * Wraps `runSubAgent` with configurable retry logic. Each retry
 * creates a fresh LLM session. User abort signals are respected
 * between retries (no retry after abort).
 *
 * @param maxRetries - Maximum retry attempts (0 = no retries, default)
 */
export async function runSubAgentWithRetry(
  params: Parameters<typeof runSubAgent>[0] & {
    maxRetries?: number;
  },
): Promise<ExpertExecutionResult> {
  const { maxRetries = DEFAULT_MAX_RETRIES, ...subAgentParams } = params;

  let lastResult: ExpertExecutionResult | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Don't retry if aborted
    if (params.abortSignal?.aborted) {
      break;
    }

    lastResult = await runSubAgent(subAgentParams);

    if (lastResult.success) {
      return lastResult;
    }

    // Don't retry on abort
    if (lastResult.errors?.some((e) => e.includes("abort"))) {
      break;
    }

    if (attempt < maxRetries) {
      console.log(
        `[SubAgentRunner] Expert ${params.roleName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`,
      );
    }
  }

  return lastResult ?? {
    success: false,
    output: `Expert ${params.roleName} aborted before execution`,
    toolCallCount: 0,
    errors: ["Execution aborted before first attempt"],
  };
}
