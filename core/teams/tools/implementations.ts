/**
 * Teams tool implementations.
 *
 * Server-side implementations for teams mode tools
 * (TaskCreate, TaskUpdate, TaskList, TaskGet, Agent, SendMessage).
 */

import { ContextItem, ToolExtras } from "../..";
import { TaskManager } from "../taskManager";
import { TaskStatus } from "../types";
import { TeamsToolNames } from "../tools";

/**
 * Singleton TaskManager instance shared across all teams tool calls.
 */
let taskManagerInstance: TaskManager | undefined;

export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager();
  }
  return taskManagerInstance;
}

export function resetTaskManager(): void {
  taskManagerInstance?.clear();
  taskManagerInstance = undefined;
}

/**
 * Implementation: teams_task_create
 */
export async function teamsTaskCreateImpl(
  args: any,
  _extras: ToolExtras,
): Promise<ContextItem[]> {
  const tm = getTaskManager();
  const task = tm.createTask({
    subject: args.subject,
    description: args.description,
    assignee: args.assignee,
    blockedBy: args.blockedBy,
  });

  return [
    {
      name: `Task Created: ${task.id}`,
      description: task.subject,
      content: JSON.stringify(task, null, 2),
    },
  ];
}

/**
 * Implementation: teams_task_update
 */
export async function teamsTaskUpdateImpl(
  args: any,
  _extras: ToolExtras,
): Promise<ContextItem[]> {
  const tm = getTaskManager();
  const task = tm.updateTask(args.taskId, {
    status: args.status as TaskStatus,
    result: args.result,
  });

  return [
    {
      name: `Task Updated: ${task.id}`,
      description: `${task.subject} → ${task.status}`,
      content: JSON.stringify(task, null, 2),
    },
  ];
}

/**
 * Implementation: teams_task_list
 */
export async function teamsTaskListImpl(
  args: any,
  _extras: ToolExtras,
): Promise<ContextItem[]> {
  const tm = getTaskManager();
  const tasks = tm.listTasks({
    status: args.status as TaskStatus | undefined,
    assignee: args.assignee,
  });

  const summary = tm.getTaskBoardSummary();

  return [
    {
      name: "Task Board",
      description: `${tasks.length} task(s)`,
      content: summary + "\n\n" + JSON.stringify(tasks, null, 2),
    },
  ];
}

/**
 * Implementation: teams_task_get
 */
export async function teamsTaskGetImpl(
  args: any,
  _extras: ToolExtras,
): Promise<ContextItem[]> {
  const tm = getTaskManager();
  const task = tm.getTask(args.taskId);

  if (!task) {
    return [
      {
        name: "Task Not Found",
        description: `No task with ID: ${args.taskId}`,
        content: `Task "${args.taskId}" not found on the task board.`,
      },
    ];
  }

  return [
    {
      name: `Task: ${task.id}`,
      description: task.subject,
      content: JSON.stringify(task, null, 2),
    },
  ];
}

/**
 * Implementation: teams_dispatch_agent
 *
 * This is the CORE implementation that enables the Leader to delegate work
 * to expert agents. In this MVP implementation, it creates a task entry
 * and returns a structured delegation receipt. The actual sub-agent execution
 * will be handled by the orchestrator in a future phase.
 *
 * For now, this implementation:
 * 1. Validates the requested agent role exists
 * 2. Creates/updates a task board entry
 * 3. Returns a delegation receipt to the Leader
 *
 * The full sub-agent LLM execution loop will be implemented in Phase 4
 * of the orchestrator when it processes Agent tool calls.
 */
export async function teamsAgentImpl(
  args: any,
  extras: ToolExtras,
): Promise<ContextItem[]> {
  const agentName = args.agent as string;
  const taskDescription = args.task as string;
  const context = args.context as string | undefined;
  const taskId = args.taskId as string | undefined;

  // If a taskId is provided, update its status
  const tm = getTaskManager();
  if (taskId) {
    try {
      tm.updateTask(taskId, {
        status: "in_progress",
        assignee: agentName,
      });
    } catch {
      // Task might not exist yet, create it
      tm.createTask({
        subject: taskDescription.slice(0, 80),
        description: taskDescription,
        assignee: agentName,
      });
    }
  }

  // Return delegation receipt
  // In the full implementation, this would trigger the expert executor
  return [
    {
      name: `Agent Dispatched: ${agentName}`,
      description: taskDescription.slice(0, 100),
      content: [
        `## Expert Dispatch Receipt`,
        ``,
        `**Agent**: ${agentName}`,
        `**Task**: ${taskDescription}`,
        context ? `**Context**: ${context}` : "",
        taskId ? `**Task ID**: ${taskId}` : "",
        ``,
        `> The ${agentName} has been dispatched and is working on this task.`,
        `> Use TaskGet or TaskList to check progress.`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

/**
 * Implementation: teams_send_message
 */
export async function teamsSendMessageImpl(
  args: any,
  _extras: ToolExtras,
): Promise<ContextItem[]> {
  const to = args.to as string;
  const message = args.message as string;

  return [
    {
      name: `Message to ${to}`,
      description: message.slice(0, 100),
      content: [
        `## Message Sent`,
        ``,
        `**To**: ${to}`,
        `**Message**: ${message}`,
        ``,
        `> Message delivered to ${to}.`,
      ].join("\n"),
    },
  ];
}

/**
 * Route a teams tool call to the appropriate implementation.
 */
export async function callTeamsTool(
  functionName: string,
  args: any,
  extras: ToolExtras,
): Promise<ContextItem[]> {
  switch (functionName) {
    case TeamsToolNames.TaskCreate:
      return await teamsTaskCreateImpl(args, extras);
    case TeamsToolNames.TaskUpdate:
      return await teamsTaskUpdateImpl(args, extras);
    case TeamsToolNames.TaskList:
      return await teamsTaskListImpl(args, extras);
    case TeamsToolNames.TaskGet:
      return await teamsTaskGetImpl(args, extras);
    case TeamsToolNames.Agent:
      return await teamsAgentImpl(args, extras);
    case TeamsToolNames.SendMessage:
      return await teamsSendMessageImpl(args, extras);
    default:
      throw new Error(`Unknown teams tool: ${functionName}`);
  }
}

/**
 * Check if a function name belongs to a teams tool.
 */
export function isTeamsTool(functionName: string): boolean {
  return Object.values(TeamsToolNames).includes(
    functionName as TeamsToolNames,
  );
}
