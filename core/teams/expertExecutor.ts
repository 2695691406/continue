/**
 * ExpertExecutor - Handles the execution of individual expert agents.
 *
 * Responsible for:
 * - Constructing the expert's system prompt (role prompt + task contract)
 * - Filtering tools to the expert's allowed set
 * - Creating an independent LLM conversation for the expert
 * - Executing the expert's tool-call loop until completion
 * - Collecting and returning results to the Leader
 */

import { Tool } from "../..";
import { ExpertRole, DelegationContract } from "./types";
import { buildExpertSystemPrompt } from "./promptLoader";

/**
 * Build the full system prompt for an expert given its role and delegation contract.
 */
export function buildExpertDelegationPrompt(
  role: ExpertRole,
  contract: DelegationContract,
  options?: {
    workspacePath?: string;
    preferredLanguage?: string;
  },
): string {
  // Start with the role's base system prompt
  let prompt = buildExpertSystemPrompt(role, {
    isLeader: false,
    workspacePath: options?.workspacePath,
    preferredLanguage: options?.preferredLanguage,
  });

  // Append the delegation contract
  prompt += `\n\n<delegation_contract>
## Task Assignment

**Objective**: ${contract.taskObjective}
${contract.scopeBoundaries ? `\n**Scope**: ${contract.scopeBoundaries}` : ""}
${contract.context ? `\n**Context**: ${contract.context}` : ""}
${contract.acceptanceCriteria ? `\n**Acceptance Criteria**: ${contract.acceptanceCriteria}` : ""}
${contract.outputRequirements ? `\n**Output Requirements**: ${contract.outputRequirements}` : ""}
${contract.specialInstructions ? `\n**Special Instructions**: ${contract.specialInstructions}` : ""}
</delegation_contract>`;

  return prompt;
}

/**
 * Filter the available tools to only those allowed for the given expert role.
 *
 * The role's `tools` array lists allowed tool names. Only tools whose
 * function.name matches one of these names will be included.
 *
 * Built-in tool name mapping from agent-tems format to Continue's BuiltInToolNames:
 */
const TOOL_NAME_MAPPING: Record<string, string> = {
  // Agent-tems tool names → Continue built-in tool names
  read_file: "read_file",
  search_replace: "edit_existing_file",
  create_file: "create_new_file",
  grep_code: "grep_search",
  search_file: "file_glob_search",
  list_dir: "ls",
  run_in_terminal: "run_terminal_command",
  search_codebase: "codebase",
  fetch_content: "fetch_url_content",
  search_web: "search_web",
  delete_file: "create_new_file", // No direct delete, mapped to create for now
  // Teams-specific tools
  TaskCreate: "teams_task_create",
  TaskUpdate: "teams_task_update",
  TaskList: "teams_task_list",
  TaskGet: "teams_task_get",
  SendMessage: "teams_send_message",
  Agent: "teams_dispatch_agent",
};

/**
 * Filter tools to only those allowed for the expert role.
 */
export function filterToolsForExpert(
  allTools: Tool[],
  role: ExpertRole,
): Tool[] {
  // Map the role's tool names to Continue's tool names
  const allowedToolNames = new Set<string>();
  for (const toolName of role.tools) {
    const mappedName = TOOL_NAME_MAPPING[toolName] || toolName;
    allowedToolNames.add(mappedName);
  }

  return allTools.filter((tool) => allowedToolNames.has(tool.function.name));
}

/**
 * ExpertExecutionResult - the result of running an expert agent.
 */
export interface ExpertExecutionResult {
  success: boolean;
  output: string;
  toolCallCount: number;
  errors?: string[];
}

/**
 * ExpertExecutor manages the lifecycle of a single expert agent execution.
 *
 * In the MVP (Phase 4), the expert execution is handled within the
 * Leader's tool call flow. In future iterations, this will support
 * fully independent async LLM sessions.
 */
export class ExpertExecutor {
  private role: ExpertRole;
  private contract: DelegationContract;
  private systemPrompt: string;
  private allowedTools: Tool[];

  constructor(
    role: ExpertRole,
    contract: DelegationContract,
    allTools: Tool[],
    options?: {
      workspacePath?: string;
      preferredLanguage?: string;
    },
  ) {
    this.role = role;
    this.contract = contract;
    this.systemPrompt = buildExpertDelegationPrompt(role, contract, options);
    this.allowedTools = filterToolsForExpert(allTools, role);
  }

  /**
   * Get the constructed system prompt for this expert.
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Get the filtered tool set for this expert.
   */
  getTools(): Tool[] {
    return this.allowedTools;
  }

  /**
   * Get the role definition.
   */
  getRole(): ExpertRole {
    return this.role;
  }

  /**
   * Get the delegation contract.
   */
  getContract(): DelegationContract {
    return this.contract;
  }
}
