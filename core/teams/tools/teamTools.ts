/**
 * Teams mode tool definitions.
 *
 * These tools are available to the Leader agent in teams mode
 * for orchestrating expert agents and managing the task board.
 */

import { Tool } from "../..";

export const TEAMS_TOOL_GROUP_NAME = "Teams";

/** Tool name constants */
export enum TeamsToolNames {
  TaskCreate = "teams_task_create",
  TaskUpdate = "teams_task_update",
  TaskList = "teams_task_list",
  TaskGet = "teams_task_get",
  Agent = "teams_dispatch_agent",
  SendMessage = "teams_send_message",
}

/**
 * TaskCreate - Create a new task on the task board
 */
export const taskCreateTool: Tool = {
  type: "function",
  displayTitle: "Create Task",
  wouldLikeTo: 'create task "{{{ subject }}}"',
  isCurrently: 'creating task "{{{ subject }}}"',
  hasAlready: 'created task "{{{ subject }}}"',
  readonly: false,
  group: TEAMS_TOOL_GROUP_NAME,
  function: {
    name: TeamsToolNames.TaskCreate,
    description:
      "Create a new task on the task board. Use for tracking multi-step work. Each task should have a clear subject and description.",
    parameters: {
      type: "object",
      required: ["subject", "description"],
      properties: {
        subject: {
          type: "string",
          description:
            'Short imperative subject line, e.g. "Fix authentication bug in login flow"',
        },
        description: {
          type: "string",
          description:
            "Detailed task description including context, scope, and acceptance criteria",
        },
        assignee: {
          type: "string",
          description:
            'Expert role to assign, e.g. "coding-expert", "research-expert"',
        },
        blockedBy: {
          type: "array",
          items: { type: "string" },
          description: "List of task IDs that must complete before this task",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithoutPermission",
  toolCallIcon: "PlusCircleIcon",
};

/**
 * TaskUpdate - Update task status
 */
export const taskUpdateTool: Tool = {
  type: "function",
  displayTitle: "Update Task",
  wouldLikeTo: "update task {{{ taskId }}} to {{{ status }}}",
  isCurrently: "updating task {{{ taskId }}}",
  hasAlready: "updated task {{{ taskId }}}",
  readonly: false,
  group: TEAMS_TOOL_GROUP_NAME,
  function: {
    name: TeamsToolNames.TaskUpdate,
    description:
      "Update the status of a task on the task board. Use to mark tasks as in_progress, completed, cancelled, or failed.",
    parameters: {
      type: "object",
      required: ["taskId", "status"],
      properties: {
        taskId: {
          type: "string",
          description: "The ID of the task to update",
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "cancelled", "failed"],
          description: "New status for the task",
        },
        result: {
          type: "string",
          description: "Result or output summary from the task execution",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithoutPermission",
  toolCallIcon: "ArrowPathIcon",
};

/**
 * TaskList - List all tasks on the board
 */
export const taskListTool: Tool = {
  type: "function",
  displayTitle: "List Tasks",
  wouldLikeTo: "list all tasks",
  isCurrently: "listing tasks",
  hasAlready: "listed tasks",
  readonly: true,
  group: TEAMS_TOOL_GROUP_NAME,
  function: {
    name: TeamsToolNames.TaskList,
    description:
      "List all tasks on the task board. Optionally filter by status or assignee.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "cancelled", "failed"],
          description: "Filter tasks by status",
        },
        assignee: {
          type: "string",
          description: "Filter tasks by assigned expert role",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithoutPermission",
  toolCallIcon: "ListBulletIcon",
};

/**
 * TaskGet - Get details of a specific task
 */
export const taskGetTool: Tool = {
  type: "function",
  displayTitle: "Get Task",
  wouldLikeTo: "get details of task {{{ taskId }}}",
  isCurrently: "getting task {{{ taskId }}} details",
  hasAlready: "got task {{{ taskId }}} details",
  readonly: true,
  group: TEAMS_TOOL_GROUP_NAME,
  function: {
    name: TeamsToolNames.TaskGet,
    description: "Get the full details of a specific task by ID.",
    parameters: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: {
          type: "string",
          description: "The ID of the task to retrieve",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithoutPermission",
  toolCallIcon: "InformationCircleIcon",
};

/**
 * Agent - Dispatch a task to a specialized expert agent
 * This is the CORE tool that enables the Leader to delegate work.
 */
export const agentTool: Tool = {
  type: "function",
  displayTitle: "Dispatch Agent",
  wouldLikeTo: "dispatch {{{ agent }}} to work on a task",
  isCurrently: "dispatching {{{ agent }}}",
  hasAlready: "dispatched {{{ agent }}}",
  readonly: false,
  group: TEAMS_TOOL_GROUP_NAME,
  function: {
    name: TeamsToolNames.Agent,
    description:
      "Dispatch a specialized expert agent to execute a task. The agent will use its role-specific tools and system prompt to complete the work independently. Provide clear task description and context.",
    parameters: {
      type: "object",
      required: ["agent", "task"],
      properties: {
        agent: {
          type: "string",
          description:
            'Expert role name to dispatch, e.g. "coding-expert", "research-expert", "verify-expert", "backend-dev"',
        },
        task: {
          type: "string",
          description:
            "Detailed task description including objective, scope, context, and acceptance criteria",
        },
        context: {
          type: "string",
          description:
            "Additional context: relevant file paths, technical details, constraints",
        },
        taskId: {
          type: "string",
          description:
            "Optional task ID to associate this dispatch with a task board entry",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithPermission",
  toolCallIcon: "UserGroupIcon",
};

/**
 * SendMessage - Send a message to an expert agent
 */
export const sendMessageTool: Tool = {
  type: "function",
  displayTitle: "Send Message",
  wouldLikeTo: "send a message to {{{ to }}}",
  isCurrently: "messaging {{{ to }}}",
  hasAlready: "sent message to {{{ to }}}",
  readonly: false,
  group: TEAMS_TOOL_GROUP_NAME,
  function: {
    name: TeamsToolNames.SendMessage,
    description:
      "Send a message to an expert agent. Use for clarification, updated instructions, or stop commands.",
    parameters: {
      type: "object",
      required: ["to", "message"],
      properties: {
        to: {
          type: "string",
          description: "Expert role name to send the message to",
        },
        message: {
          type: "string",
          description: "Message content",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithoutPermission",
  toolCallIcon: "ChatBubbleLeftRightIcon",
};

/**
 * Get all teams mode tool definitions.
 */
export function getTeamsToolDefinitions(): Tool[] {
  return [
    taskCreateTool,
    taskUpdateTool,
    taskListTool,
    taskGetTool,
    agentTool,
    sendMessageTool,
  ];
}
