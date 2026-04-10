import { describe, expect, test } from "vitest";
import {
  buildExpertDelegationPrompt,
  filterToolsForExpert,
} from "./expertExecutor";
import { ExpertRole, DelegationContract } from "./types";
import { Tool } from "..";

describe("buildExpertDelegationPrompt", () => {
  const mockRole: ExpertRole = {
    name: "coding-expert",
    description: "Full-stack coding expert",
    tools: ["read_file", "search_replace"],
    systemPrompt: "You are a coding expert.",
    readonly: false,
  };

  const mockContract: DelegationContract = {
    taskObjective: "Implement the login feature",
    scopeBoundaries: "Only modify auth/ directory",
    context: "Using JWT for authentication",
    acceptanceCriteria: "Login works with email/password",
    outputRequirements: "Working code with tests",
  };

  test("includes role system prompt", () => {
    const prompt = buildExpertDelegationPrompt(mockRole, mockContract);
    expect(prompt).toContain("You are a coding expert.");
  });

  test("includes delegation contract", () => {
    const prompt = buildExpertDelegationPrompt(mockRole, mockContract);
    expect(prompt).toContain("<delegation_contract>");
    expect(prompt).toContain("Implement the login feature");
    expect(prompt).toContain("Only modify auth/ directory");
    expect(prompt).toContain("Using JWT for authentication");
    expect(prompt).toContain("Login works with email/password");
    expect(prompt).toContain("Working code with tests");
  });

  test("includes communication template", () => {
    const prompt = buildExpertDelegationPrompt(mockRole, mockContract);
    expect(prompt).toContain("<communication>");
  });

  test("includes expert mode template", () => {
    const prompt = buildExpertDelegationPrompt(mockRole, mockContract);
    expect(prompt).toContain("<expert_mode>");
  });

  test("omits optional fields when not provided", () => {
    const minimalContract: DelegationContract = {
      taskObjective: "Do something",
    };
    const prompt = buildExpertDelegationPrompt(mockRole, minimalContract);
    expect(prompt).toContain("Do something");
    expect(prompt).not.toContain("**Scope**");
    expect(prompt).not.toContain("**Context**");
  });

  test("injects workspace path", () => {
    const role: ExpertRole = {
      ...mockRole,
      systemPrompt: "Working in {{workspace_path}}.",
    };
    const prompt = buildExpertDelegationPrompt(role, mockContract, {
      workspacePath: "/home/user/proj",
    });
    expect(prompt).toContain("/home/user/proj");
    expect(prompt).not.toContain("{{workspace_path}}");
  });
});

describe("filterToolsForExpert", () => {
  const mockTools: Tool[] = [
    {
      type: "function",
      displayTitle: "Read File",
      readonly: true,
      group: "Built-In",
      function: { name: "read_file", description: "Read a file" },
    },
    {
      type: "function",
      displayTitle: "Edit File",
      readonly: false,
      group: "Built-In",
      function: { name: "edit_existing_file", description: "Edit a file" },
    },
    {
      type: "function",
      displayTitle: "Create File",
      readonly: false,
      group: "Built-In",
      function: { name: "create_new_file", description: "Create a file" },
    },
    {
      type: "function",
      displayTitle: "Grep Search",
      readonly: true,
      group: "Built-In",
      function: { name: "grep_search", description: "Search code" },
    },
    {
      type: "function",
      displayTitle: "Run Terminal",
      readonly: false,
      group: "Built-In",
      function: {
        name: "run_terminal_command",
        description: "Run terminal command",
      },
    },
  ];

  test("filters tools based on role's allowed tools", () => {
    const role: ExpertRole = {
      name: "research-expert",
      description: "Research expert",
      tools: ["read_file", "grep_code"], // grep_code maps to grep_search
      systemPrompt: "",
      readonly: true,
    };

    const filtered = filterToolsForExpert(mockTools, role);
    expect(filtered.map((t) => t.function.name)).toEqual([
      "read_file",
      "grep_search",
    ]);
  });

  test("maps agent-tems tool names to Continue names", () => {
    const role: ExpertRole = {
      name: "coding-expert",
      description: "Coding expert",
      tools: ["read_file", "search_replace", "create_file", "run_in_terminal"],
      systemPrompt: "",
      readonly: false,
    };

    const filtered = filterToolsForExpert(mockTools, role);
    const names = filtered.map((t) => t.function.name);
    expect(names).toContain("read_file");
    expect(names).toContain("edit_existing_file"); // search_replace → edit_existing_file
    expect(names).toContain("create_new_file"); // create_file → create_new_file
    expect(names).toContain("run_terminal_command"); // run_in_terminal → run_terminal_command
  });

  test("returns empty array for role with no matching tools", () => {
    const role: ExpertRole = {
      name: "empty",
      description: "No tools",
      tools: ["nonexistent_tool"],
      systemPrompt: "",
    };

    const filtered = filterToolsForExpert(mockTools, role);
    expect(filtered).toHaveLength(0);
  });
});
