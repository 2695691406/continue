/**
 * Teams mode type definitions
 * Defines the core interfaces for the multi-agent expert team system
 */

/** Status of an expert agent instance */
export type ExpertStatus = "idle" | "working" | "completed" | "failed";

/** Status of a task in the task board */
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed";

/**
 * Defines an expert role with its capabilities and constraints.
 * Each role corresponds to a prompt file in core/teams/prompts/
 */
export interface ExpertRole {
  /** Unique identifier, e.g. "coding-expert", "research-expert" */
  name: string;
  /** Human-readable description of the role's responsibilities */
  description: string;
  /** List of tool names this expert is allowed to use */
  tools: string[];
  /** The system prompt loaded from the role's .md file */
  systemPrompt: string;
  /** Whether this role only has read-only access (e.g. code-review-expert) */
  readonly?: boolean;
}

/**
 * A single execution step from a sub-agent's tool-call loop.
 * Represents either a tool call or a text response from the expert LLM.
 */
export interface SubAgentStep {
  /** Step type: tool call or final text output */
  type: "tool_call" | "text";
  /** Timestamp when this step occurred */
  timestamp: number;
  /** For tool calls: the tool name */
  toolName?: string;
  /** For tool calls: the arguments (stringified JSON) */
  toolArgs?: string;
  /** For tool calls: the result content */
  toolResult?: string;
  /** For tool calls: whether the call succeeded */
  toolSuccess?: boolean;
  /** For text steps: the text content */
  content?: string;
}

/**
 * A running instance of an expert agent
 */
export interface ExpertInstance {
  /** Unique runtime instance ID */
  id: string;
  /** The role definition */
  role: ExpertRole;
  /** Current status */
  status: ExpertStatus;
  /** The task currently being worked on */
  currentTask?: TaskItem;
  /** Accumulated output/result from this expert */
  result?: string;
  /** Execution steps (tool calls and text responses) for GUI display */
  steps?: SubAgentStep[];
}

/**
 * A task managed by the Leader through the task board
 */
export interface TaskItem {
  /** Unique task ID */
  id: string;
  /** Short imperative subject line */
  subject: string;
  /** Detailed task description with context and acceptance criteria */
  description: string;
  /** Current status */
  status: TaskStatus;
  /** Name of the expert role assigned to this task */
  assignee?: string;
  /** IDs of tasks that must complete before this one can start */
  blockedBy?: string[];
  /** Result or output from the task execution */
  result?: string;
  /** Active form text shown when in_progress (e.g. "Fixing authentication bug") */
  activeForm?: string;
  /** Timestamp of creation */
  createdAt: number;
  /** Timestamp of last update */
  updatedAt: number;
}

/**
 * The delegation contract sent from Leader to an Expert
 * Contains all context needed for the expert to work independently
 */
export interface DelegationContract {
  /** What needs to be accomplished */
  taskObjective: string;
  /** What can and cannot be done */
  scopeBoundaries?: string;
  /** Technical context needed */
  context?: string;
  /** How to determine the task is complete */
  acceptanceCriteria?: string;
  /** Expected output format */
  outputRequirements?: string;
  /** Task-level directives */
  specialInstructions?: string;
}

/**
 * Message passed between Leader and Experts
 */
export interface TeamsMessage {
  /** Sender identifier */
  from: string;
  /** Recipient identifier */
  to: string;
  /** Message content */
  content: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Overall state of the teams mode session
 */
export interface TeamsState {
  /** Active expert instances */
  experts: ExpertInstance[];
  /** Task board */
  tasks: TaskItem[];
  /** Messages exchanged between leader and experts */
  messages: TeamsMessage[];
  /** Whether the orchestrator is currently running */
  isOrchestratorRunning: boolean;
}

/**
 * YAML frontmatter parsed from an expert prompt .md file
 */
export interface ExpertPromptFrontmatter {
  name: string;
  description: string;
  tools: string;
  version?: string;
  last_updated?: string;
}
