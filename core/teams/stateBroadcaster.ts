/**
 * TeamsStateBroadcaster - Bridges orchestrator events to the GUI.
 *
 * Listens to orchestrator events (expert dispatched, completed, failed,
 * task changes) and broadcasts the current state to the GUI webview
 * via the `teamsStateUpdate` protocol message.
 *
 * This ensures the ExpertPanel and TaskBoard components in the GUI
 * always reflect the current teams mode state.
 */

import { TeamsOrchestrator, OrchestratorEvent } from "./orchestrator";
import { TaskManager, TaskChangeListener } from "./taskManager";

/**
 * The serialized state sent to the GUI via teamsStateUpdate.
 * Must match the type defined in core/protocol/webview.ts
 */
export interface TeamsStateUpdatePayload {
  experts: Array<{
    id: string;
    roleName: string;
    status: "idle" | "working" | "completed" | "failed";
    currentTaskSubject?: string;
    /** Execution steps (tool calls and text responses) for GUI display */
    steps?: Array<{
      type: "tool_call" | "text";
      timestamp: number;
      toolName?: string;
      toolArgs?: string;
      toolResult?: string;
      toolSuccess?: boolean;
      content?: string;
    }>;
  }>;
  tasks: Array<{
    id: string;
    subject: string;
    status: string;
    assignee?: string;
  }>;
  isOrchestratorRunning: boolean;
}

/**
 * Callback for sending state updates to the GUI.
 * This is called with the serialized state whenever it changes.
 */
export type StateSendFn = (payload: TeamsStateUpdatePayload) => void;

/**
 * TeamsStateBroadcaster manages the subscription to orchestrator and
 * task manager events, and emits serialized state updates.
 */
export class TeamsStateBroadcaster {
  private orchestrator: TeamsOrchestrator;
  private taskManager: TaskManager;
  private sendFn: StateSendFn;
  private unsubOrchestrator?: () => void;
  private unsubTaskManager?: () => void;
  private isActive = false;

  constructor(
    orchestrator: TeamsOrchestrator,
    taskManager: TaskManager,
    sendFn: StateSendFn,
  ) {
    this.orchestrator = orchestrator;
    this.taskManager = taskManager;
    this.sendFn = sendFn;
  }

  /**
   * Start broadcasting state changes to the GUI.
   * Subscribes to orchestrator events and task manager changes.
   */
  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Subscribe to orchestrator events
    this.unsubOrchestrator = this.orchestrator.onEvent(
      (_event: OrchestratorEvent) => {
        this.broadcast();
      },
    );

    // Subscribe to task manager changes
    this.unsubTaskManager = this.taskManager.onTaskChange(() => {
      this.broadcast();
    });

    // Send initial state
    this.broadcast();
  }

  /**
   * Stop broadcasting and clean up subscriptions.
   */
  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;

    this.unsubOrchestrator?.();
    this.unsubTaskManager?.();
    this.unsubOrchestrator = undefined;
    this.unsubTaskManager = undefined;
  }

  /**
   * Broadcast the current state to the GUI.
   */
  broadcast(): void {
    if (!this.isActive) return;

    const state = this.orchestrator.getState();

    const payload: TeamsStateUpdatePayload = {
      experts: state.experts.map((expert) => ({
        id: expert.id,
        roleName: expert.role.name,
        status: expert.status,
        currentTaskSubject: expert.currentTask?.subject,
        steps: expert.steps,
      })),
      tasks: state.tasks.map((task) => ({
        id: task.id,
        subject: task.subject,
        status: task.status,
        assignee: task.assignee,
      })),
      isOrchestratorRunning: state.isOrchestratorRunning,
    };

    this.sendFn(payload);
  }
}
