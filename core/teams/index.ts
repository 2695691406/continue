/**
 * Teams Mode - Multi-agent expert team collaboration system
 *
 * This module implements the Leader-Expert orchestration pattern where
 * a Leader agent coordinates specialized expert agents to complete
 * complex coding tasks.
 */

export { ExpertRegistry, getExpertRegistry } from "./expertRegistry";
export { loadExpertRole, buildExpertSystemPrompt, parseFrontmatter } from "./promptLoader";
export { TaskManager } from "./taskManager";
export {
  TeamsOrchestrator,
  getOrchestrator,
  resetOrchestrator,
} from "./orchestrator";
export {
  ExpertExecutor,
  buildExpertDelegationPrompt,
  filterToolsForExpert,
} from "./expertExecutor";
export { runSubAgent } from "./subAgentRunner";
export {
  dispatchParallel,
  formatParallelResult,
} from "./parallelDispatcher";
export {
  TeamsStateBroadcaster,
} from "./stateBroadcaster";
export type {
  TeamsStateUpdatePayload,
  StateSendFn,
} from "./stateBroadcaster";
export type {
  ExpertRole,
  ExpertInstance,
  ExpertStatus,
  TaskItem,
  TaskStatus,
  DelegationContract,
  TeamsMessage,
  TeamsState,
} from "./types";
