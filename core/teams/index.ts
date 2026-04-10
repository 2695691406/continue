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
