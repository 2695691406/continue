/**
 * TeamsOrchestrator - The core orchestration engine for teams mode.
 *
 * Manages the Leader's turn-based loop:
 * Check task board → Identify unblocked tasks → Batch dispatch → End turn
 *
 * Coordinates expert agent instances, tracks their status,
 * handles conflict detection, and manages the overall workflow.
 */

import { ExpertInstance, ExpertRole, SubAgentStep, TaskItem, TeamsMessage, TeamsState } from "./types";
import { TaskManager } from "./taskManager";
import { ExpertRegistry, getExpertRegistry } from "./expertRegistry";

let nextExpertId = 1;

function generateExpertId(roleName: string): string {
  return `${roleName}-${nextExpertId++}`;
}

/**
 * Callback for orchestrator events (expert status changes, messages, etc.)
 */
export type OrchestratorEventListener = (event: OrchestratorEvent) => void;

export interface OrchestratorEvent {
  type:
    | "expert_dispatched"
    | "expert_completed"
    | "expert_failed"
    | "expert_step"
    | "message_sent"
    | "task_updated"
    | "orchestration_complete";
  data: any;
}

/**
 * TeamsOrchestrator manages the multi-agent collaboration lifecycle.
 */
export class TeamsOrchestrator {
  private experts: Map<string, ExpertInstance> = new Map();
  private messages: TeamsMessage[] = [];
  private taskManager: TaskManager;
  private registry: ExpertRegistry;
  private listeners: OrchestratorEventListener[] = [];
  private isRunning: boolean = false;

  constructor(taskManager: TaskManager, registry?: ExpertRegistry) {
    this.taskManager = taskManager;
    this.registry = registry || getExpertRegistry();
  }

  /**
   * Dispatch an expert agent to work on a task.
   * Creates an ExpertInstance and tracks its lifecycle.
   */
  dispatchExpert(
    roleName: string,
    taskDescription: string,
    context?: string,
    taskId?: string,
  ): ExpertInstance {
    const role = this.registry.getRole(roleName);
    if (!role) {
      throw new Error(`Expert role not found: ${roleName}`);
    }

    const expertId = generateExpertId(roleName);
    const expert: ExpertInstance = {
      id: expertId,
      role,
      status: "working",
      currentTask: taskId
        ? this.taskManager.getTask(taskId)
        : undefined,
      steps: [],
    };

    this.experts.set(expertId, expert);
    this.emit({
      type: "expert_dispatched",
      data: { expertId, roleName, taskDescription },
    });

    return expert;
  }

  /**
   * Mark an expert as completed with a result.
   */
  completeExpert(expertId: string, result: string): void {
    const expert = this.experts.get(expertId);
    if (!expert) {
      throw new Error(`Expert instance not found: ${expertId}`);
    }

    expert.status = "completed";
    expert.result = result;

    this.emit({
      type: "expert_completed",
      data: { expertId, role: expert.role.name, result },
    });
  }

  /**
   * Mark an expert as failed.
   */
  failExpert(expertId: string, error: string): void {
    const expert = this.experts.get(expertId);
    if (!expert) {
      throw new Error(`Expert instance not found: ${expertId}`);
    }

    expert.status = "failed";
    expert.result = `Error: ${error}`;

    this.emit({
      type: "expert_failed",
      data: { expertId, role: expert.role.name, error },
    });
  }

  /**
   * Add an execution step to an expert's step history.
   * This is called during the sub-agent tool-call loop to track progress.
   */
  addExpertStep(expertId: string, step: SubAgentStep): void {
    const expert = this.experts.get(expertId);
    if (!expert) return; // Silently ignore if expert not found

    if (!expert.steps) {
      expert.steps = [];
    }
    expert.steps.push(step);

    this.emit({
      type: "expert_step",
      data: { expertId, step },
    });
  }

  /**
   * Send a message between the Leader and an Expert.
   */
  sendMessage(from: string, to: string, content: string): void {
    const message: TeamsMessage = {
      from,
      to,
      content,
      timestamp: Date.now(),
    };

    this.messages.push(message);
    this.emit({
      type: "message_sent",
      data: message,
    });
  }

  /**
   * Get the current state of the orchestrator for GUI display.
   */
  getState(): TeamsState {
    return {
      experts: Array.from(this.experts.values()),
      tasks: this.taskManager.getAllTasks(),
      messages: this.messages,
      isOrchestratorRunning: this.isRunning,
    };
  }

  /**
   * Get an expert instance by ID.
   */
  getExpert(expertId: string): ExpertInstance | undefined {
    return this.experts.get(expertId);
  }

  /**
   * Get all active (working) experts.
   */
  getActiveExperts(): ExpertInstance[] {
    return Array.from(this.experts.values()).filter(
      (e) => e.status === "working",
    );
  }

  /**
   * Check if any experts are still working.
   */
  hasActiveExperts(): boolean {
    return this.getActiveExperts().length > 0;
  }

  /**
   * Get the task manager.
   */
  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  /**
   * Check for potential file conflicts between active experts.
   * Returns a list of conflict descriptions if found.
   */
  detectConflicts(): string[] {
    const conflicts: string[] = [];
    const activeExperts = this.getActiveExperts();

    // Check for overlapping write scopes
    // In a full implementation, this would track which files each expert
    // is modifying and flag conflicts
    for (let i = 0; i < activeExperts.length; i++) {
      for (let j = i + 1; j < activeExperts.length; j++) {
        const a = activeExperts[i];
        const b = activeExperts[j];

        // Two coding experts shouldn't work simultaneously without scope isolation
        if (
          !a.role.readonly &&
          !b.role.readonly &&
          a.role.name !== "research-expert" &&
          b.role.name !== "research-expert"
        ) {
          conflicts.push(
            `Potential conflict: ${a.role.name} (${a.id}) and ${b.role.name} (${b.id}) are both active and have write access.`,
          );
        }
      }
    }

    return conflicts;
  }

  /**
   * Subscribe to orchestrator events.
   */
  onEvent(listener: OrchestratorEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Emit an event to all listeners.
   */
  private emit(event: OrchestratorEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Reset the orchestrator for a new session.
   */
  reset(): void {
    this.experts.clear();
    this.messages = [];
    this.isRunning = false;
    this.taskManager.clear();
    nextExpertId = 1;
  }

  /**
   * Set the running state.
   */
  setRunning(running: boolean): void {
    this.isRunning = running;
  }
}

/**
 * Singleton orchestrator instance.
 */
let orchestratorInstance: TeamsOrchestrator | undefined;

export function getOrchestrator(taskManager?: TaskManager): TeamsOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new TeamsOrchestrator(
      taskManager || new TaskManager(),
    );
  }
  return orchestratorInstance;
}

export function resetOrchestrator(): void {
  orchestratorInstance?.reset();
  orchestratorInstance = undefined;
}
