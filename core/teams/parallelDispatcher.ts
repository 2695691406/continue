/**
 * ParallelDispatcher - Enables parallel execution of multiple expert agents.
 *
 * When the Leader dispatches multiple independent experts (no shared
 * file dependencies), they can run in parallel using Promise.allSettled.
 * This significantly reduces total execution time for multi-expert workflows.
 *
 * Conflict detection prevents parallel execution of write-capable experts
 * that might modify the same files.
 */

import { ToolExtras } from "../..";
import { getOrchestrator } from "../orchestrator";
import { ExpertExecutionResult } from "../expertExecutor";
import { runSubAgent, CallToolFn } from "../subAgentRunner";

/**
 * A dispatch request for a single expert agent.
 */
export interface DispatchRequest {
  roleName: string;
  taskDescription: string;
  context?: string;
  taskId?: string;
}

/**
 * Result from a parallel dispatch batch.
 */
export interface ParallelDispatchResult {
  /** Results keyed by role name */
  results: Map<string, ExpertExecutionResult>;
  /** Total time in ms for the batch */
  totalTimeMs: number;
  /** Whether any expert failed */
  hasFailures: boolean;
}

/**
 * Dispatch multiple expert agents in parallel using Promise.allSettled.
 *
 * This is called when the Leader wants to dispatch multiple independent
 * experts simultaneously. Each expert runs in its own LLM session
 * with its own message history.
 *
 * @param requests - Array of dispatch requests
 * @param extras - Tool extras (shared LLM, config, IDE access)
 * @param callToolFn - The callTool function for tool execution
 * @param abortSignal - Optional abort signal to cancel all dispatches
 */
export async function dispatchParallel(
  requests: DispatchRequest[],
  extras: ToolExtras,
  callToolFn: CallToolFn,
  abortSignal?: AbortSignal,
): Promise<ParallelDispatchResult> {
  const startTime = Date.now();

  // Pre-check for conflicts
  const orchestrator = getOrchestrator();
  const conflicts = orchestrator.detectConflicts();
  if (conflicts.length > 0) {
    console.warn(
      `[ParallelDispatcher] Conflicts detected: ${conflicts.join("; ")}`,
    );
  }

  // Create abort controllers for each expert (linked to the parent signal)
  const expertAbortControllers = requests.map(() => new AbortController());
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      expertAbortControllers.forEach((ctrl) => ctrl.abort());
    });
  }

  // Launch all experts in parallel
  const promises = requests.map(async (request, index) => {
    const result = await runSubAgent({
      roleName: request.roleName,
      taskDescription: request.taskDescription,
      context: request.context,
      taskId: request.taskId,
      extras,
      callToolFn,
      abortSignal: expertAbortControllers[index].signal,
    });
    return { roleName: request.roleName, result };
  });

  // Wait for all to settle (don't fail fast)
  const settled = await Promise.allSettled(promises);

  // Collect results
  const results = new Map<string, ExpertExecutionResult>();
  let hasFailures = false;

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.set(outcome.value.roleName, outcome.value.result);
      if (!outcome.value.result.success) {
        hasFailures = true;
      }
    } else {
      // Promise rejected (unexpected error)
      hasFailures = true;
      const errorMsg = outcome.reason?.message || String(outcome.reason);
      results.set("unknown", {
        success: false,
        output: `Parallel dispatch failed: ${errorMsg}`,
        toolCallCount: 0,
        errors: [errorMsg],
      });
    }
  }

  return {
    results,
    totalTimeMs: Date.now() - startTime,
    hasFailures,
  };
}

/**
 * Format a parallel dispatch result into a summary for the Leader.
 */
export function formatParallelResult(
  result: ParallelDispatchResult,
): string {
  const lines: string[] = [
    `## Parallel Dispatch Summary`,
    ``,
    `**Total Time**: ${(result.totalTimeMs / 1000).toFixed(1)}s`,
    `**Experts**: ${result.results.size}`,
    `**Status**: ${result.hasFailures ? "⚠️ Some experts failed" : "✅ All succeeded"}`,
    ``,
  ];

  for (const [roleName, expertResult] of result.results) {
    const icon = expertResult.success ? "✅" : "❌";
    lines.push(`### ${icon} ${roleName}`);
    lines.push(`- **Tool Calls**: ${expertResult.toolCallCount}`);
    lines.push(
      `- **Output**: ${expertResult.output.slice(0, 500)}${expertResult.output.length > 500 ? "..." : ""}`,
    );
    if (expertResult.errors?.length) {
      lines.push(
        `- **Errors**: ${expertResult.errors.join("; ")}`,
      );
    }
    lines.push(``);
  }

  return lines.join("\n");
}
