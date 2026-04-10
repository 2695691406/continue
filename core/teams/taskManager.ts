/**
 * Task Manager - manages the task board for the teams mode.
 *
 * Handles creation, updating, querying, and dependency tracking
 * of tasks dispatched by the Leader to expert agents.
 */

import { TaskItem, TaskStatus } from "./types";

let nextTaskId = 1;

/**
 * Generate a unique task ID.
 */
function generateTaskId(): string {
  return `task-${nextTaskId++}`;
}

/**
 * Callback type for task status change events.
 */
export type TaskChangeListener = (task: TaskItem, oldStatus: TaskStatus) => void;

/**
 * TaskManager maintains the task board and handles
 * task lifecycle, dependency resolution, and status tracking.
 */
export class TaskManager {
  private tasks: Map<string, TaskItem> = new Map();
  private listeners: TaskChangeListener[] = [];

  /**
   * Create a new task on the task board.
   */
  createTask(params: {
    subject: string;
    description: string;
    assignee?: string;
    blockedBy?: string[];
    activeForm?: string;
  }): TaskItem {
    const now = Date.now();
    const task: TaskItem = {
      id: generateTaskId(),
      subject: params.subject,
      description: params.description,
      status: "pending",
      assignee: params.assignee,
      blockedBy: params.blockedBy,
      activeForm: params.activeForm,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Update a task's status and optionally its result.
   */
  updateTask(
    id: string,
    updates: {
      status?: TaskStatus;
      result?: string;
      assignee?: string;
      activeForm?: string;
    },
  ): TaskItem {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const oldStatus = task.status;

    if (updates.status) {
      task.status = updates.status;
    }
    if (updates.result !== undefined) {
      task.result = updates.result;
    }
    if (updates.assignee !== undefined) {
      task.assignee = updates.assignee;
    }
    if (updates.activeForm !== undefined) {
      task.activeForm = updates.activeForm;
    }
    task.updatedAt = Date.now();

    // Notify listeners of status change
    if (updates.status && updates.status !== oldStatus) {
      for (const listener of this.listeners) {
        listener(task, oldStatus);
      }
    }

    return task;
  }

  /**
   * Get a task by ID.
   */
  getTask(id: string): TaskItem | undefined {
    return this.tasks.get(id);
  }

  /**
   * List tasks, optionally filtered by status or assignee.
   */
  listTasks(filter?: {
    status?: TaskStatus;
    assignee?: string;
  }): TaskItem[] {
    let tasks = Array.from(this.tasks.values());

    if (filter?.status) {
      tasks = tasks.filter((t) => t.status === filter.status);
    }
    if (filter?.assignee) {
      tasks = tasks.filter((t) => t.assignee === filter.assignee);
    }

    return tasks;
  }

  /**
   * Get tasks that are ready to be dispatched (pending + all dependencies resolved).
   */
  getDispatchableTasks(): TaskItem[] {
    return Array.from(this.tasks.values()).filter((task) => {
      if (task.status !== "pending") {
        return false;
      }
      // Check if all blocking tasks are completed
      if (task.blockedBy && task.blockedBy.length > 0) {
        return task.blockedBy.every((blockId) => {
          const blockingTask = this.tasks.get(blockId);
          return blockingTask?.status === "completed";
        });
      }
      return true;
    });
  }

  /**
   * Check if all tasks are in a terminal state (completed, cancelled, or failed).
   */
  isAllComplete(): boolean {
    return Array.from(this.tasks.values()).every(
      (t) =>
        t.status === "completed" ||
        t.status === "cancelled" ||
        t.status === "failed",
    );
  }

  /**
   * Get a summary of the task board for the Leader's context.
   */
  getTaskBoardSummary(): string {
    const tasks = Array.from(this.tasks.values());
    if (tasks.length === 0) {
      return "No tasks on the board.";
    }

    const lines: string[] = ["## Task Board"];
    for (const task of tasks) {
      const blocked =
        task.blockedBy && task.blockedBy.length > 0
          ? ` (blocked by: ${task.blockedBy.join(", ")})`
          : "";
      const assignee = task.assignee ? ` → ${task.assignee}` : "";
      lines.push(
        `- [${task.status}] ${task.id}: ${task.subject}${assignee}${blocked}`,
      );
    }
    return lines.join("\n");
  }

  /**
   * Subscribe to task status change events.
   */
  onTaskChange(listener: TaskChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Clear all tasks (for session reset).
   */
  clear(): void {
    this.tasks.clear();
    nextTaskId = 1;
  }

  /**
   * Get all tasks as an array.
   */
  getAllTasks(): TaskItem[] {
    return Array.from(this.tasks.values());
  }
}
