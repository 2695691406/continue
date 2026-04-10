---
name: create-skill
description: "Guides you through creating effective Agent Skills for Hema-Copilot. Skills are markdown files that teach the agent how to perform specific tasks. If you want to create your skills, you should use create-skill firstly."
---

# Create Skill Guide

You are now helping the user create a new Hema-Copilot Agent Skill. Follow this guide to produce a well-structured, effective skill.

## 1. What is a Hema-Copilot Skill?

A Skill is a self-contained instruction package that extends an agent's capabilities for a specific task. Each skill lives in its own directory under `.Hema-Copilot/skills/` and centers around a `SKILL.md` file.

**How it works:** When a skill is invoked — either by the user typing `/{skill-name}` or by the system automatically matching the user's request to a skill's description — the content of `SKILL.md` (the body, after the YAML frontmatter) is injected into the agent's context as instructions. The agent then follows those instructions to carry out the task.

This means the body of `SKILL.md` is essentially an **operational manual** written for the agent. It should be clear, specific, and actionable.

## 2. Directory Structure

Every skill must follow this directory layout:

```
.Hema-Copilot/skills/{skill-name}/
├── SKILL.md          # Required: Main instruction file
├── REFERENCE.md      # Optional: Detailed reference documentation
└── EXAMPLES.md       # Optional: Example documents
```

- **SKILL.md** — The only required file. Contains the YAML frontmatter (metadata) and the markdown body (instructions).
- **REFERENCE.md** — Use this for lengthy reference material (API specs, schema definitions, etc.) that would bloat the main file.
- **EXAMPLES.md** — Use this for extended examples that help the agent understand expected inputs/outputs.

## 3. SKILL.md File Format

### YAML Frontmatter (Required)

The file must start with a YAML frontmatter block delimited by `---`:

```yaml
---
name: my-skill-name
description: "A clear description of what this skill does and when it should be used."
---
```

| Field         | Required | Constraints                                              | Purpose                                                       |
|---------------|----------|----------------------------------------------------------|---------------------------------------------------------------|
| `name`        | Yes      | Lowercase letters, digits, and hyphens only. Max 64 chars. | Unique identifier for the skill. Used in `/{name}` invocation. |
| `description` | Yes      | Max 1024 characters.                                      | Describes the skill's purpose. Used by the system to decide when to automatically trigger the skill. |

### Body (Markdown Instructions)

Everything after the closing `---` of the frontmatter is the **body**. This is the core of the skill — the instructions the agent will receive and follow when the skill is invoked.

Write the body in Markdown. Structure it with headings, lists, and code blocks as needed.

## 4. Best Practices for Writing Skills

- **Description quality matters.** The `description` field is used for automatic skill matching. Write it to clearly convey the skill's purpose and the kinds of user requests that should trigger it. Be specific about the use case, not just the topic.
- **Write instructions like an operational manual.** Imagine you are writing for a capable colleague who has never done this task before. Be concrete and step-by-step.
- **Define inputs and outputs.** State what information the agent should gather from the user, and what the expected deliverable is (files created, code modified, answers provided, etc.).
- **Use structured steps.** Break the workflow into numbered steps. Each step should have a clear action and completion criteria.
- **Handle edge cases.** Include guidance for common errors, ambiguous inputs, or situations where the agent should ask for clarification.
- **Specify path conventions.** If the skill involves file operations, define where files should be created or read from (e.g., relative to workspace root, under `.Hema-Copilot/`, etc.).
- **Stay focused.** Each skill should do one thing well. Avoid cramming multiple unrelated tasks into a single skill. If a workflow is complex, consider splitting it into multiple skills.
- **Keep the body concise but complete.** The entire body is injected into context, so avoid unnecessary filler — but do not omit important instructions.

## 5. Trigger Mechanisms

A skill can be invoked in two ways:

1. **Manual trigger:** The user types `/{skill-name}` (e.g., `/create-skill`). This always works as long as the skill exists.
2. **Automatic trigger:** The system compares the user's request against all available skill descriptions and automatically activates the best match. This happens transparently to the user.

Because automatic triggering relies entirely on the `description` field, writing a high-quality description is critical:
- Include the **action** the skill performs (e.g., "Generates…", "Reviews…", "Converts…").
- Include the **context** or **trigger phrases** a user might say (e.g., "when the user wants to…", "use this when…").
- Avoid vague descriptions like "Helps with coding" — be specific about what kind of coding and when.

## 6. Creation Workflow

Follow these steps when helping the user create a new skill:

### Step 1: Understand the Goal
Ask the user:
- What task should this skill help with?
- Who will use it and in what scenario?
- What should the end result look like?

Do not proceed until you have a clear understanding of the skill's purpose.

### Step 2: Determine the Skill Name
Help the user choose a `name` that:
- Uses only lowercase letters, digits, and hyphens
- Is concise but descriptive (e.g., `review-pr`, `gen-api-client`, `migrate-db`)
- Does not exceed 64 characters
- Does not conflict with existing skill names

### Step 3: Write the Description
Draft a `description` that:
- Clearly states what the skill does
- Mentions the trigger conditions (when should it activate?)
- Stays within 1024 characters
- Is optimized for automatic matching

Present the draft to the user for confirmation.

### Step 4: Write the Body Instructions
Draft the body content:
- Structure it with clear headings and numbered steps
- Define the workflow the agent should follow
- Specify expected inputs from the user and outputs from the agent
- Include error handling and edge case guidance
- Keep it actionable and specific

Review the draft with the user and iterate if needed.

### Step 5: Create the Files
Create the skill directory and files:
```
.Hema-Copilot/skills/{skill-name}/SKILL.md
```
Write the complete SKILL.md with frontmatter and body. If the user needs REFERENCE.md or EXAMPLES.md, create those as well.

### Step 6: Confirm and Explain Usage
After creation, tell the user:
- The skill has been created at `.Hema-Copilot/skills/{skill-name}/SKILL.md`
- They can invoke it manually with `/{skill-name}`
- The system will also auto-trigger it when requests match the description
- They can edit the file anytime to refine the skill's behavior

## 7. Example

Here is a minimal but complete SKILL.md example:

```markdown
---
name: gen-commit-msg
description: "Generates a conventional commit message based on the current staged changes. Use when the user asks for help writing a commit message or wants to commit with a generated message."
---

# Generate Commit Message

Help the user create a well-formatted commit message for their staged changes.

## Workflow

1. Run `git diff --cached --stat` to see what files are staged.
2. Run `git diff --cached` to read the actual changes.
3. Analyze the changes and determine:
   - The type of change (feat, fix, refactor, docs, chore, test, etc.)
   - The scope (which module/component is affected)
   - A concise summary of what changed and why
4. Generate a commit message following the Conventional Commits format:
   ```
   type(scope): subject

   body (optional, for complex changes)
   ```
5. Present the message to the user for approval.
6. If the user approves, run `git commit -m "..."` with the message.
7. If the user wants changes, revise and repeat from step 5.

## Rules
- Keep the subject line under 72 characters.
- Use imperative mood in the subject (e.g., "Add feature" not "Added feature").
- Only include a body if the changes are non-trivial.
- Never commit without user confirmation.
```
