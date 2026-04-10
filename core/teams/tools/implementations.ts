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
import { runSubAgent } from "../subAgentRunner";

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
 * Dispatches a specialized expert agent to execute a task.
 * Creates an independent LLM session with the expert's system prompt
 * and restricted tool set, runs a tool-call loop until completion,
 * and returns the collected results.
 */
export async function teamsAgentImpl(
  args: any,
  extras: ToolExtras,
): Promise<ContextItem[]> {
  const agentName = args.agent as string;
  const taskDescription = args.task as string;
  const context = args.context as string | undefined;
  const taskId = args.taskId as string | undefined;

  // If a taskId is provided, update its status to in_progress
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

  // Run the sub-agent LLM session
  // Use dynamic import to break the circular dependency:
  // callTool.ts → implementations.ts → subAgentRunner → callTool.ts
  const { callTool } = await import("../../tools/callTool");
  const result = await runSubAgent({
    roleName: agentName,
    taskDescription,
    context,
    taskId,
    extras,
    callToolFn: callTool,
  });

  // If a taskId was provided, update the task with the result
  if (taskId) {
    try {
      tm.updateTask(taskId, {
        status: result.success ? "completed" : "failed",
        result: result.output.slice(0, 2000),
      });
    } catch {
      // Task may have already been updated by the expert itself
    }
  }

  // Format the result for the Leader
  const statusIcon = result.success ? "✅" : "❌";
  const errorSection =
    result.errors && result.errors.length > 0
      ? `\n\n### Errors\n${result.errors.map((e) => `- ${e}`).join("\n")}`
      : "";

  return [
    {
      name: `${statusIcon} ${agentName} Report`,
      description: `${result.toolCallCount} tool calls, ${result.success ? "succeeded" : "failed"}`,
      content: [
        `## Expert Report: ${agentName}`,
        ``,
        `**Status**: ${result.success ? "Completed" : "Failed"}`,
        `**Tool Calls**: ${result.toolCallCount}`,
        taskId ? `**Task ID**: ${taskId}` : "",
        ``,
        `### Output`,
        ``,
        result.output,
        errorSection,
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
