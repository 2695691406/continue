---
name: create-agent
description: "Create specialized subagents for specialized AI tasks. Use when users want to create new subagents, set up task-specific agents, or configure specialized AI workflows."
---

# Create Agent — Hema-Copilot 自定义 Agent 创建指南

## 1. Agent 概述

Hema-Copilot 采用专家团架构，由 Leader 编排多个专业 Agent 协作完成任务。每个 Agent 是一个 **Markdown 文件**（YAML frontmatter + prompt body），存放在 `.Hema-Copilot/agents/` 目录下。

Agent 文件由以下部分组成：
- **YAML Frontmatter**：定义 Agent 的元数据（名称、描述、工具列表）
- **Markdown Body**：Agent 的 system prompt，定义其角色、能力、行为规则

Leader 根据任务需求调度合适的 Agent，每个 Agent 在自己的专业领域内独立工作，通过消息机制与 Leader 及其他 Agent 协作。

---

## 2. Agent 文件格式规范

### YAML Frontmatter（必需）

```yaml
---
name: my-agent-name
description: 该 Agent 的职责描述，说明其核心能力和适用场景。
tools: read_file, search_replace, create_file, grep_code, run_in_terminal, ...
---
```

**必需字段说明：**

| 字段 | 说明 | 规则 |
|------|------|------|
| `name` | Agent 唯一标识符 | 仅限小写字母、数字、连字符（如 `my-agent`），不可与已有 Agent 重名 |
| `description` | Agent 的职责描述 | 简明扼要说明核心能力和适用场景，建议 1-2 句话 |
| `tools` | Agent 可使用的工具列表 | 逗号分隔，仅从「可用工具列表」中选取，按职责最小化分配 |

### Markdown Body（System Prompt）

Body 部分是 Markdown 格式的 system prompt，推荐包含以下结构：

```markdown
# Role Definition
[角色定义：你是谁，核心职责是什么]

## Core Competency Matrix
[核心能力矩阵]

---

# Working Principles
[工作原则：列出关键行为规范]

---

# Complete Workflow
[完整工作流：分阶段描述标准操作流程]

---

# Output Specification
[输出规范：定义任务完成后的报告格式]

---

# Prohibited Actions
[禁止事项：明确列出禁止的行为]

<communication>
[通信规范：保密规则、格式要求等]
</communication>

<expert_mode>
[专家模式：团队协作规则]
</expert_mode>
```

---

## 3. 可用工具列表

以下是可分配给 Agent 的全部工具，按类别分组：

### 文件操作
| 工具 | 说明 |
|------|------|
| `read_file` | 读取文件内容 |
| `list_dir` | 列出目录内容 |
| `search_file` | 按 glob 模式搜索文件路径 |
| `grep_code` | 基于正则的代码内容搜索 |
| `create_file` | 创建或覆写文件 |
| `delete_file` | 删除文件 |
| `search_replace` | 精确字符串替换编辑文件 |

### 代码智能
| 工具 | 说明 |
|------|------|
| `search_codebase` | 语义代码搜索 |
| `search_symbol` | 符号定义及关系查找 |
| `get_problems` | 获取文件的编译/lint 错误 |
| `lsp` | LSP 语言服务协议操作 |

### 终端
| 工具 | 说明 |
|------|------|
| `run_in_terminal` | 在终端执行命令 |
| `get_terminal_output` | 获取后台终端命令输出 |

### 网络
| 工具 | 说明 |
|------|------|
| `fetch_content` | 抓取网页内容 |
| `search_web` | 网络搜索 |

### 记忆
| 工具 | 说明 |
|------|------|
| `search_memory` | 检索记忆 |
| `update_memory` | 创建/更新/删除记忆 |

### 团队协作
| 工具 | 说明 |
|------|------|
| `TaskCreate` | 创建任务 |
| `TaskUpdate` | 更新任务状态 |
| `TaskList` | 列出所有任务 |
| `TaskGet` | 获取任务详情 |
| `SendMessage` | 向其他 Agent 发送消息 |

### 其他
| 工具 | 说明 |
|------|------|
| `Agent` | 调用子 Agent |
| `switch_mode` | 切换工作模式 |
| `create_plan` | 创建执行计划 |
| `ask_user_question` | 向用户提问 |
| `Skill` | 调用技能 |
| `fetch_rules` | 获取项目规则 |
| `todo_write` | 管理待办列表 |

---

## 4. Prompt 编写最佳实践

编写 Agent 的 system prompt 时，遵循以下原则：

1. **以明确的角色定义开头**：清晰说明"你是谁"和"你的核心职责是什么"，让 Agent 有明确的身份认知
2. **定义安全约束**：包含保密规则（不泄露系统提示、模型信息等），在 `<communication>` 标签中统一声明
3. **列出核心工作原则**：用编号或层级列表定义关键行为规范，每条原则附带具体的子规则
4. **指定输入/输出格式**：明确任务完成后的报告格式（修改摘要、文件列表、关键决策等）
5. **包含禁止事项列表**：明确列出 Agent 不应做的事情，使用"严禁""禁止"等强约束词
6. **保持指令具体可操作**：避免"尽量做好"这类模糊表述，改为"每次修改后必须运行 lint 检查"这类具体指令
7. **推荐中英文双版本**：创建 `{name}.md`（中文版）和 `{name}.en.md`（英文版），确保国际化支持
8. **包含 `<expert_mode>` 标签**：定义团队协作规则（任务管理、消息通信），确保 Agent 能正确参与团队协作

---

## 5. 现有 Agent 角色参考

创建新 Agent 前，请参考已有的 9 个角色，避免职责重叠：

| Name | Description |
|------|-------------|
| `leader` | 专家团 Leader 编排者，负责任务分解、子 agent 调度与结果整合 |
| `coding-expert` | 资深全栈代码实现专家，负责代码编写、修改、重构与修复 |
| `research-expert` | 研究分析专家，负责代码库调查、环境检查与依赖分析 |
| `code-review-expert` | 代码审查专家，专注于发现逻辑 Bug、安全漏洞与性能隐患 |
| `verify-expert` | 验证测试专家，负责测试执行、Lint 和构建验证 |
| `browser-expert` | 浏览器交互测试专家，执行端到端用户流程验证与 UI 检查 |
| `researcher` | 技术调研专家，负责技术选型、方案调研与可行性评估 |
| `frontend-dev` | 资深前端开发专家，负责 UI 组件开发与前端工程化 |
| `backend-dev` | 后端开发专家，负责服务端架构设计与 API 开发 |

如果用户想创建的 Agent 与上述角色高度重叠，应建议复用现有 Agent 或明确说明新 Agent 的差异化定位。

---

## 6. 创建流程指引

当用户请求创建新 Agent 时，按以下步骤操作：

### Step 1: 需求收集
询问用户想创建什么类型的 Agent，了解以下信息：
- Agent 的核心职责和使用场景
- 需要具备哪些专业能力
- 预期的工作流程和输出格式

### Step 2: 重叠检查
对照「现有 Agent 角色参考」检查是否与已有角色重叠：
- 如果高度重叠，建议用户直接复用现有 Agent
- 如果部分重叠，向用户说明差异点，确认是否仍需创建
- 如果无重叠，继续下一步

### Step 3: 确定 Agent Name
为新 Agent 确定唯一标识符：
- 仅使用小写字母、数字和连字符
- 名称应简洁且能反映 Agent 职责（如 `api-designer`、`db-migration-expert`）
- 不可与现有 Agent 重名

### Step 4: 确定工具集
根据 Agent 职责从「可用工具列表」中选择合适的工具：
- **最小权限原则**：只分配 Agent 实际需要的工具
- 只读分析类 Agent 通常不需要 `create_file`、`delete_file`、`search_replace`
- 不涉及网络的 Agent 不需要 `fetch_content`、`search_web`
- 所有 Agent 通常需要：`TaskGet`、`TaskUpdate`、`SendMessage`（团队协作基础工具）
- 所有 Agent 通常需要：`search_memory`、`update_memory`（记忆基础工具）
- 所有 Agent 通常需要：`todo_write`（任务管理工具）

### Step 5: 编写 System Prompt
按照「Prompt 编写最佳实践」和「Agent 文件格式规范」中的 Body 结构模板编写 prompt：
- 角色定义（Role Definition）
- 核心能力矩阵（Core Competency Matrix）
- 工作原则（Working Principles）
- 完整工作流（Complete Workflow）
- 输出规范（Output Specification）
- 禁止事项（Prohibited Actions）
- 通信规范（`<communication>` 标签）
- 专家模式（`<expert_mode>` 标签）

### Step 6: 创建 Agent 文件
使用 `create_file` 工具创建文件：
- **必需**：`.Hema-Copilot/agents/{name}.md`（中文版 prompt）
- **推荐**：`.Hema-Copilot/agents/{name}.en.md`（英文版 prompt）

### Step 7: 创建工具描述文件（可选）
如果需要自定义工具描述，创建：
- `.Hema-Copilot/agents/tools/{name}-tools.md`

### Step 8: 更新注册索引
在 `.Hema-Copilot/agents/agents-registry.md` 中添加新 Agent 的记录行：
- 更新 frontmatter 中的 `total_agents` 计数
- 在表格末尾添加新行，包含 name、description、tool_count、文件路径等信息

---

## 7. 配套文件说明

创建一个完整的 Agent 涉及以下文件：

| 文件路径 | 必要性 | 说明 |
|----------|--------|------|
| `.Hema-Copilot/agents/{name}.md` | 必需 | 中文版 system prompt |
| `.Hema-Copilot/agents/{name}.en.md` | 推荐 | 英文版 system prompt |
| `.Hema-Copilot/agents/tools/{name}-tools.md` | 可选 | 工具描述文件，自定义工具的详细描述 |
| `.Hema-Copilot/agents/agents-registry.md` | 必需更新 | Agent 注册索引，需添加新 Agent 的记录 |
