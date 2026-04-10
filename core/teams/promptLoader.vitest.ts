import { describe, expect, test } from "vitest";
import {
  parseFrontmatter,
  loadExpertRole,
  buildExpertSystemPrompt,
  COMMUNICATION_TEMPLATE,
  EXPERT_MODE_TEMPLATE,
} from "./promptLoader";

describe("parseFrontmatter", () => {
  test("parses valid YAML frontmatter", () => {
    const content = `---
name: test-expert
description: A test expert
tools: read_file, grep_code
---

# Test Expert

This is the body content.`;

    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.name).toBe("test-expert");
    expect(frontmatter.description).toBe("A test expert");
    expect(frontmatter.tools).toBe("read_file, grep_code");
    expect(body).toContain("# Test Expert");
    expect(body).toContain("This is the body content.");
  });

  test("returns empty frontmatter when no YAML block", () => {
    const content = "# Just a markdown file\n\nWith no frontmatter.";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(Object.keys(frontmatter)).toHaveLength(0);
    expect(body).toBe(content);
  });

  test("strips surrounding quotes from values", () => {
    const content = `---
name: "quoted-expert"
description: 'single quoted'
---

Body`;

    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.name).toBe("quoted-expert");
    expect(frontmatter.description).toBe("single quoted");
  });

  test("handles multi-word description with colons", () => {
    const content = `---
name: expert
description: An expert for: testing things
---

Body`;

    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.name).toBe("expert");
    expect(frontmatter.description).toBe("An expert for: testing things");
  });
});

describe("loadExpertRole", () => {
  test("loads a role from markdown content", () => {
    const content = `---
name: coding-expert
description: Full-stack coding expert
tools: read_file, search_replace, create_file, run_in_terminal
---

# Coding Expert

You are a senior coding expert.`;

    const role = loadExpertRole(content);
    expect(role.name).toBe("coding-expert");
    expect(role.description).toBe("Full-stack coding expert");
    expect(role.tools).toEqual([
      "read_file",
      "search_replace",
      "create_file",
      "run_in_terminal",
    ]);
    expect(role.systemPrompt).toContain("# Coding Expert");
    expect(role.readonly).toBe(false); // has search_replace and create_file
  });

  test("marks read-only roles correctly", () => {
    const content = `---
name: code-review-expert
description: Code review specialist
tools: read_file, grep_code, search_file
---

# Code Review Expert

You are a code review expert.`;

    const role = loadExpertRole(content);
    expect(role.name).toBe("code-review-expert");
    expect(role.readonly).toBe(true);
  });

  test("handles empty tools list", () => {
    const content = `---
name: empty-tools
description: No tools
tools:
---

Body`;

    const role = loadExpertRole(content);
    // empty string split will give [""] but it should handle gracefully
    expect(role.name).toBe("empty-tools");
  });

  test("handles content without frontmatter", () => {
    const content = "# Plain Expert\n\nNo frontmatter here.";
    const role = loadExpertRole(content);
    expect(role.name).toBe("unknown");
    expect(role.tools).toEqual([]);
  });
});

describe("buildExpertSystemPrompt", () => {
  const mockRole = {
    name: "test-expert",
    description: "Test expert",
    tools: ["read_file"],
    systemPrompt: "You are a test expert in {{workspace_path}}.",
    readonly: true,
  };

  test("adds communication template to all agents", () => {
    const prompt = buildExpertSystemPrompt(mockRole);
    expect(prompt).toContain(COMMUNICATION_TEMPLATE.trim());
  });

  test("adds expert mode template to non-leader agents", () => {
    const prompt = buildExpertSystemPrompt(mockRole, { isLeader: false });
    expect(prompt).toContain(EXPERT_MODE_TEMPLATE.trim());
  });

  test("does NOT add expert mode template to leader", () => {
    const prompt = buildExpertSystemPrompt(mockRole, { isLeader: true });
    expect(prompt).not.toContain(EXPERT_MODE_TEMPLATE.trim());
  });

  test("injects workspace path", () => {
    const prompt = buildExpertSystemPrompt(mockRole, {
      workspacePath: "/home/user/project",
    });
    expect(prompt).toContain("/home/user/project");
    expect(prompt).not.toContain("{{workspace_path}}");
  });

  test("injects preferred language", () => {
    const role = {
      ...mockRole,
      systemPrompt: "Reply in {{preferred_language}}.",
    };
    const prompt = buildExpertSystemPrompt(role, {
      preferredLanguage: "Chinese",
    });
    expect(prompt).toContain("Chinese");
    expect(prompt).not.toContain("{{preferred_language}}");
  });
});
