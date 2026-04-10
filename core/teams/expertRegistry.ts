/**
 * Expert Registry - manages registration and lookup of expert roles.
 *
 * Provides built-in expert roles loaded from core/teams/prompts/
 * and supports user-defined custom experts.
 */

import * as fs from "fs";
import * as path from "path";

import { ExpertRole } from "./types";
import { loadExpertRole } from "./promptLoader";

/**
 * The ExpertRegistry maintains a map of available expert roles.
 */
export class ExpertRegistry {
  private roles: Map<string, ExpertRole> = new Map();
  private promptsDir: string;

  constructor(promptsDir?: string) {
    this.promptsDir =
      promptsDir || path.join(__dirname, "prompts");
    this.registerBuiltInRoles();
  }

  /**
   * Register built-in expert roles from prompt files in the prompts directory.
   */
  private registerBuiltInRoles(): void {
    const builtInFiles = [
      "leader.md",
      "coding-expert.md",
      "research-expert.md",
      "backend-dev.md",
      "researcher.md",
      "verify-expert.md",
      "code-review-expert.md",
    ];

    for (const filename of builtInFiles) {
      try {
        const filePath = path.join(this.promptsDir, filename);
        const content = fs.readFileSync(filePath, "utf-8");
        const role = loadExpertRole(content);
        this.roles.set(role.name, role);
      } catch (e) {
        console.warn(`Failed to load expert prompt: ${filename}`, e);
      }
    }
  }

  /**
   * Register a custom expert role from user-provided prompt content.
   */
  registerCustomRole(promptContent: string): ExpertRole {
    const role = loadExpertRole(promptContent);
    this.roles.set(role.name, role);
    return role;
  }

  /**
   * Get an expert role by name.
   */
  getRole(name: string): ExpertRole | undefined {
    return this.roles.get(name);
  }

  /**
   * Get the Leader role.
   */
  getLeaderRole(): ExpertRole | undefined {
    return this.roles.get("leader");
  }

  /**
   * Get all available expert roles (excluding the leader).
   */
  getExpertRoles(): ExpertRole[] {
    return Array.from(this.roles.values()).filter((r) => r.name !== "leader");
  }

  /**
   * Get all registered roles including the leader.
   */
  getAllRoles(): ExpertRole[] {
    return Array.from(this.roles.values());
  }

  /**
   * Check if a role exists.
   */
  hasRole(name: string): boolean {
    return this.roles.has(name);
  }

  /**
   * Get a list of available expert role names.
   */
  getAvailableExpertNames(): string[] {
    return Array.from(this.roles.keys()).filter((name) => name !== "leader");
  }
}

/**
 * Singleton instance of the ExpertRegistry.
 * Initialized lazily on first access.
 */
let registryInstance: ExpertRegistry | undefined;

export function getExpertRegistry(promptsDir?: string): ExpertRegistry {
  if (!registryInstance) {
    registryInstance = new ExpertRegistry(promptsDir);
  }
  return registryInstance;
}

