# 专家团模式 (Teams Mode) 开发计划

> 在 Continue IDE 插件的 Agent 模式基础上，新增"专家团"模式（Teams Mode），实现 Leader-Expert 多智能体协作引擎。

---

## 一、设计精髓理解

### 核心理念

agent-tems 设计的本质是将 **"一个全能 AI 助手"** 转变为 **"一支有组织的 AI 开发团队"**，核心创新点：

1. **关注点分离**：9 个专家角色各司其职（Leader 调度 + 8 个执行专家），写代码的不测试、做审查的不改代码
2. **最小权限**：每个专家只拥有完成其职责所需的工具集（如 code-review-expert 没有文件编辑工具）
3. **五阶段流水线**：Research → Plan → Code → Verify → Review，带门禁条件和自适应缩放
4. **依赖感知并行**：独立模块流水线并行，共享区域串行，自动管理 blockedBy 依赖链
5. **反馈自愈循环**：验证失败 → 精准定位 → 定向修复 → 局部重新验证，不重跑全流程
6. **API 契约对齐**：多专家协作时先定义接口契约，同一规范逐字下发到每个相关专家

### 与现有 Agent Mode 的关系

| 维度 | 现有 Agent Mode | 新增 Teams Mode |
|------|----------------|----------------|
| 架构 | 单 Agent + 工具调用 | Leader + 多 Expert Sub-Agent 协作 |
| System Prompt | 通用 agent 提示 | Leader 用编排提示，每个 Expert 用专业提示 |
| 工具集 | 所有工具平等可用 | 按角色分配，Leader 有编排工具，Expert 有领域工具 |
| 任务管理 | 无 | TaskCreate/TaskUpdate/TaskList/TaskGet |
| 消息通信 | 用户 ↔ AI | 用户 ↔ Leader ↔ Experts (SendMessage) |
| 验证机制 | 用户自行判断 | 内置 Verify + Review 自动闭环 |

---

## 二、技术架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                       GUI Layer                              │
│  ModeSelect 增加 "teams" 选项                                │
│  TeamsPanel 显示 Expert 状态面板                              │
│  TaskBoard 显示任务看板                                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                      Core Layer                              │
│  MessageModes 新增 "teams"                                   │
│  TeamsOrchestrator 编排引擎                                   │
│  ExpertAgent 专家执行器                                       │
│  TaskManager 任务管理系统                                     │
│  PromptLoader 专家提示词加载器                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                    LLM / Tool Layer                           │
│  Leader 使用编排工具集 (Agent/TaskCreate/SendMessage/...)     │
│  每个 Expert 使用角色专属工具集                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、分阶段开发计划

### 阶段 1：类型定义与模式注册（基础骨架）

**目标**：让 "teams" 成为一个可选的合法模式，UI 可切换，但功能暂未实现

- [ ] **1.1** 扩展 `MessageModes` 类型
  - 文件：`core/index.d.ts`
  - 修改：`export type MessageModes = "chat" | "agent" | "plan" | "background" | "teams"`
  - 影响范围：所有消费 `MessageModes` 的位置都需要处理新的 `"teams"` 分支

- [ ] **1.2** 添加 Teams 模式默认系统消息
  - 文件：`core/llm/defaultSystemMessages.ts`
  - 新增：`DEFAULT_TEAMS_SYSTEM_MESSAGE` 常量（Leader 的系统提示）
  - 内容来源：`agent-tems/leader.en.md` 的核心编排指令

- [ ] **1.3** 更新系统消息加载逻辑
  - 文件：`gui/src/redux/util/getBaseSystemMessage.ts`
  - 修改：增加 `messageMode === "teams"` 分支，返回 Leader 的系统消息
  - 新增：`model.baseTeamsSystemMessage` 属性支持模型级覆盖

- [ ] **1.4** 更新工具选择逻辑
  - 文件：`gui/src/redux/selectors/selectActiveTools.ts`
  - 修改：`mode === "teams"` 时，返回 Leader 专用工具集（编排类工具 + 只读工具）

- [ ] **1.5** 更新 GUI 模式选择器
  - 文件：`gui/src/components/ModeSelect/ModeSelect.tsx`
  - 修改：添加 "Teams" / "专家团" 选项
  - 新增图标：`ModeIcon.tsx` 中增加 teams 模式图标（如 `UserGroupIcon`）
  - 更新 `cycleMode()` 循环顺序：`chat → plan → agent → teams → background → chat`

- [ ] **1.6** 更新 Redux session state
  - 文件：`gui/src/redux/slices/sessionSlice.ts`
  - 确认 `setMode` reducer 能正确接受 `"teams"` 值
  - 考虑新增 teams 模式相关的 state 字段（如 `activeExperts`, `taskBoard`）

- [ ] **1.7** 更新 LLMOptions 类型
  - 文件：`core/index.d.ts`（LLMOptions 接口）
  - 新增：`baseTeamsSystemMessage?: string` 属性

---

### 阶段 2：Expert 定义与 Prompt 管理系统

**目标**：建立专家角色的定义、存储和加载机制

- [ ] **2.1** 设计 Expert 角色接口
  - 新建文件：`core/teams/types.ts`
  - 定义接口：
    ```typescript
    interface ExpertRole {
      name: string;           // "coding-expert", "research-expert", ...
      description: string;    // 角色描述
      tools: string[];        // 允许使用的工具名列表
      systemPrompt: string;   // 角色系统提示（从 .md 文件加载）
      readonly?: boolean;     // 是否为只读角色（如 code-review-expert）
    }
    
    interface ExpertInstance {
      id: string;             // 运行时实例 ID
      role: ExpertRole;       // 角色定义
      status: "idle" | "working" | "completed" | "failed";
      currentTask?: TaskItem;
    }
    
    interface TaskItem {
      id: string;
      subject: string;
      description: string;
      status: "pending" | "in_progress" | "completed" | "cancelled" | "failed";
      assignee?: string;      // Expert name
      blockedBy?: string[];   // 依赖的任务 ID 列表
      createdAt: number;
      updatedAt: number;
    }
    ```

- [ ] **2.2** 创建内置专家 Prompt 目录
  - 将 `agent-tems/` 下的英文 prompt 文件复制/整合到 `core/teams/prompts/` 目录
  - 文件列表：
    - `core/teams/prompts/leader.md` — Leader 编排系统提示
    - `core/teams/prompts/coding-expert.md` — 全栈编码专家
    - `core/teams/prompts/research-expert.md` — 研究分析专家
    - `core/teams/prompts/backend-dev.md` — 后端开发专家
    - `core/teams/prompts/researcher.md` — 技术调研专家
  - 注意：先实现核心 4-5 个角色，后续再补充 frontend-dev, verify-expert, code-review-expert, browser-expert

- [ ] **2.3** Prompt 加载器
  - 新建文件：`core/teams/promptLoader.ts`
  - 功能：
    - 解析 YAML frontmatter + Markdown body
    - 从文件加载 Expert 角色定义（name, description, tools）
    - 注入运行时模板变量（workspace_path, preferred_language, directory_tree 等）
    - 拼接 `<communication>` 和 `<expert_mode>` 模板块（来自 `core_templates.md`）

- [ ] **2.4** Expert 角色注册表
  - 新建文件：`core/teams/expertRegistry.ts`
  - 功能：
    - 注册内置专家角色
    - 支持用户自定义专家（从 `.continue/agents/` 目录加载）
    - 按名称查找专家角色定义
    - 返回可用专家列表

---

### 阶段 3：任务管理系统 (Task System)

**目标**：实现 Leader 管理专家任务的核心调度能力

- [ ] **3.1** 任务管理器核心
  - 新建文件：`core/teams/taskManager.ts`
  - 实现 TaskManager 类：
    - `createTask(subject, description, assignee?, blockedBy?)` → TaskItem
    - `updateTask(id, status, result?)` → void
    - `listTasks(filter?)` → TaskItem[]
    - `getTask(id)` → TaskItem
    - 自动检查 `blockedBy` 依赖，标记可调度任务
    - 事件通知：任务状态变更时通知订阅者

- [ ] **3.2** 注册 Leader 专用工具
  - 新建文件：`core/teams/tools/`
  - 工具列表：
    - `TaskCreate` — 创建任务
    - `TaskUpdate` — 更新任务状态
    - `TaskList` — 列出所有任务
    - `TaskGet` — 获取任务详情
    - `Agent` — 调用子 Agent（核心！）
    - `SendMessage` — 向专家发送消息
    - `switch_mode` — 切换到 Plan 模式
    - `ask_user_question` — 向用户提问
  - 每个工具遵循现有 `core/tools/` 的 Tool 接口定义

- [ ] **3.3** 工具执行器适配
  - 文件：`core/tools/callTool.ts`
  - 修改：增加 teams 模式专用工具的调用分支
  - 新增：`callTeamsTool()` 函数处理 TaskCreate/Agent/SendMessage 等

---

### 阶段 4：Sub-Agent 编排引擎（核心）

**目标**：实现 Leader 调度 Expert 执行的核心引擎

- [ ] **4.1** TeamsOrchestrator 主类
  - 新建文件：`core/teams/orchestrator.ts`
  - 职责：
    - 管理 Leader 的回合制循环（Check → Dispatch → End）
    - 维护 Expert 实例池
    - 冲突检测（同一文件不能被两个 Expert 同时修改）
    - 依赖感知调度（自动检查 blockedBy）

- [ ] **4.2** Expert Agent 执行器
  - 新建文件：`core/teams/expertExecutor.ts`
  - 功能：
    - 接收 Leader 分派的任务和上下文
    - 构造 Expert 的系统提示（角色 prompt + 任务描述 + 约束）
    - 创建独立的 LLM 会话（使用 Expert 的系统提示和工具集）
    - 执行 Expert 的工具调用循环
    - 收集执行结果并返回给 Leader
  - 关键设计：Expert 的 LLM 调用使用 **受限工具集**（基于角色定义的 tools 列表）

- [ ] **4.3** `Agent` 工具实现
  - 这是 Leader 调用 Expert 的入口
  - 参数：`{ agent: string, task: string, context?: string }`
  - 流程：
    1. 从 ExpertRegistry 查找角色定义
    2. 过滤出角色允许的工具集
    3. 构造 Expert 系统提示（角色 prompt + task delegation contract）
    4. 创建新的 LLM 流式会话
    5. 执行 Expert 的 tool-call 循环直到完成
    6. 返回执行结果给 Leader

- [ ] **4.4** `SendMessage` 工具实现
  - Leader ↔ Expert 之间的消息通道
  - 参数：`{ to: string, message: string }`
  - 将消息注入目标 Expert 的对话上下文

- [ ] **4.5** 并行调度支持
  - Leader 一次可以派发多个独立任务给不同 Expert
  - 使用 `Promise.allSettled()` 并行执行
  - 结果汇总后触发 Leader 的下一轮决策

---

### 阶段 5：GUI 界面集成

**目标**：在前端展示 Teams 模式的专家面板和任务看板

- [ ] **5.1** Expert 状态面板
  - 新建文件：`gui/src/components/Teams/ExpertPanel.tsx`
  - 显示当前活跃的专家列表和状态
  - 每个专家显示：角色图标、名称、当前任务、状态（idle/working/completed）

- [ ] **5.2** 任务看板组件
  - 新建文件：`gui/src/components/Teams/TaskBoard.tsx`
  - 显示任务列表，按状态分组（pending / in_progress / completed）
  - 显示任务依赖关系
  - 支持展开查看任务详情

- [ ] **5.3** 聊天消息区域适配
  - 修改：现有聊天消息组件
  - 在 teams 模式下：
    - Leader 的消息正常显示
    - Expert 的工作过程可折叠显示（类似工具调用的折叠效果）
    - 标注消息来源角色（如 "[Coding Expert] 正在修改 src/xxx.ts..."）

- [ ] **5.4** Redux state 扩展
  - 文件：`gui/src/redux/slices/sessionSlice.ts`
  - 新增 teams 相关 state：
    ```typescript
    teamsState?: {
      experts: ExpertInstance[];
      tasks: TaskItem[];
      isOrchestratorRunning: boolean;
    }
    ```
  - 新增 reducers：`updateExpertStatus`, `updateTaskBoard`, `addTeamsMessage`

- [ ] **5.5** 消息流适配
  - 文件：`gui/src/redux/thunks/streamNormalInput.ts`
  - 修改：当 `mode === "teams"` 时：
    - 使用 Leader 的系统提示和编排工具集
    - 拦截 `Agent` 工具调用，启动 Expert 子会话
    - Expert 子会话的中间过程流式推送到 GUI
    - Expert 完成后将结果注入 Leader 对话上下文

---

### 阶段 6：消息通信协议

**目标**：定义 Leader 与 Expert 之间的通信协议

- [ ] **6.1** 扩展 Core Protocol
  - 文件：`core/protocol/core.ts`
  - 新增协议消息类型：
    - `"teams/createExpert"` — 创建专家实例
    - `"teams/dispatchTask"` — 派发任务给专家
    - `"teams/expertComplete"` — 专家完成通知
    - `"teams/sendMessage"` — 专家间消息
    - `"teams/getTaskBoard"` — 获取任务看板

- [ ] **6.2** IDE Messenger 适配
  - 文件：`core/protocol/messenger/` 相关文件
  - 为新增的协议消息类型添加处理器
  - 保证 VS Code 扩展层能正确转发 teams 相关消息

---

### 阶段 7：配置与持久化

**目标**：支持用户自定义专家团配置

- [ ] **7.1** YAML 配置支持
  - 文件：`packages/config-yaml/src/schemas/models.ts`
  - 新增 teams 模式配置选项：
    ```yaml
    models:
      - name: My Model
        provider: openai
        model: gpt-4o
        teamsConfig:
          enabled: true
          defaultExperts: ["coding-expert", "research-expert"]
          customExperts: []  # 自定义专家 .md 文件路径
    ```

- [ ] **7.2** 用户自定义专家加载
  - 支持从 `.continue/agents/` 目录加载用户自定义 Expert 的 .md 文件
  - 复用 `agent-tems/create-agent/SKILL.md` 中定义的格式规范

- [ ] **7.3** Teams Session 持久化
  - 任务看板状态在会话中持久化
  - 专家执行历史可回溯

---

### 阶段 8：测试与验证

- [ ] **8.1** 单元测试
  - TaskManager 的 CRUD 和依赖检查
  - PromptLoader 的模板解析和变量注入
  - ExpertRegistry 的角色注册和查找
  - TeamsOrchestrator 的调度逻辑

- [ ] **8.2** 集成测试
  - Leader → Expert → Tool Call → Result 全链路
  - 并行调度正确性
  - 冲突检测和串行回退
  - 反馈自愈循环（验证失败 → 重新修复 → 重新验证）

- [ ] **8.3** E2E 测试
  - GUI 模式切换到 teams
  - Expert 面板和任务看板正确渲染
  - 完整的一个任务从用户输入到最终交付

---

## 四、实现优先级与依赖关系

```
阶段1 (类型+模式注册)  ──→  阶段2 (Expert定义)  ──→  阶段3 (任务管理)
         │                                                    │
         │                                                    ▼
         │                                              阶段4 (编排引擎)
         │                                                    │
         ▼                                                    ▼
    阶段5 (GUI)  ◀─────────────────────────────────    阶段6 (通信协议)
         │
         ▼
    阶段7 (配置)  ──→  阶段8 (测试)
```

**建议实施路径（MVP 优先）**：
1. 阶段 1 → 阶段 2 → 阶段 3（基础设施）
2. 阶段 4（核心引擎，MVP 核心）
3. 阶段 5 + 6（GUI + 通信，MVP 可用）
4. 阶段 7 + 8（增强 + 质量保障）

---

## 五、关键技术决策点（需确认）

### 决策 1：Sub-Agent 实现方式
- **选项 A**：Leader 的一次 tool call 内同步完成 Expert 执行（类似现有 tool call 流程）
- **选项 B**：Expert 作为独立的异步 LLM 会话，通过事件驱动通信
- **推荐**：选项 A 更简单，先用选项 A 实现 MVP，后续可演进到选项 B

### 决策 2：Expert 的 LLM 模型
- **选项 A**：所有 Expert 使用与 Leader 相同的模型
- **选项 B**：允许不同 Expert 使用不同模型（如 research 用便宜模型，coding 用强模型）
- **推荐**：MVP 用选项 A，配置系统预留选项 B 扩展点

### 决策 3：对话上下文隔离
- **选项 A**：每个 Expert 有独立的对话上下文，Leader 看到摘要结果
- **选项 B**：所有 Expert 共享同一个对话上下文
- **推荐**：选项 A（设计文档的核心理念是关注点分离）

### 决策 4：内置专家数量（MVP）
- **推荐 MVP 角色**：
  1. `leader` — 技术总监（编排调度）
  2. `coding-expert` — 全栈编码
  3. `research-expert` — 研究分析
  4. `verify-expert` — 验证测试（可简化为直接执行命令）
- **后续迭代**增加：frontend-dev, backend-dev, code-review-expert, browser-expert, researcher

### 决策 5：GUI 展示形态
- **选项 A**：在现有聊天面板内嵌入折叠式专家面板
- **选项 B**：新开一个侧边面板专门显示专家团状态
- **推荐**：选项 A（改动最小，体验连贯）

---

## 六、文件变更清单（预估）

### 新增文件（~15-20 个）
| 文件路径 | 说明 |
|---------|------|
| `core/teams/types.ts` | 类型定义 |
| `core/teams/orchestrator.ts` | 编排引擎 |
| `core/teams/expertExecutor.ts` | 专家执行器 |
| `core/teams/taskManager.ts` | 任务管理器 |
| `core/teams/expertRegistry.ts` | 专家注册表 |
| `core/teams/promptLoader.ts` | Prompt 加载器 |
| `core/teams/tools/taskCreate.ts` | TaskCreate 工具 |
| `core/teams/tools/taskUpdate.ts` | TaskUpdate 工具 |
| `core/teams/tools/taskList.ts` | TaskList 工具 |
| `core/teams/tools/taskGet.ts` | TaskGet 工具 |
| `core/teams/tools/agentTool.ts` | Agent 调用工具 |
| `core/teams/tools/sendMessage.ts` | SendMessage 工具 |
| `core/teams/prompts/leader.md` | Leader 系统提示 |
| `core/teams/prompts/coding-expert.md` | 编码专家提示 |
| `core/teams/prompts/research-expert.md` | 研究专家提示 |
| `gui/src/components/Teams/ExpertPanel.tsx` | 专家面板组件 |
| `gui/src/components/Teams/TaskBoard.tsx` | 任务看板组件 |

### 修改文件（~10-15 个）
| 文件路径 | 修改内容 |
|---------|---------|
| `core/index.d.ts` | 扩展 MessageModes, LLMOptions |
| `core/llm/defaultSystemMessages.ts` | 新增 DEFAULT_TEAMS_SYSTEM_MESSAGE |
| `gui/src/redux/util/getBaseSystemMessage.ts` | 增加 teams 分支 |
| `gui/src/redux/selectors/selectActiveTools.ts` | 增加 teams 工具选择逻辑 |
| `gui/src/components/ModeSelect/ModeSelect.tsx` | 增加 teams 选项 |
| `gui/src/components/ModeSelect/ModeIcon.tsx` | 增加 teams 图标 |
| `gui/src/redux/slices/sessionSlice.ts` | 扩展 teams state |
| `gui/src/redux/thunks/streamNormalInput.ts` | 适配 teams 消息流 |
| `core/tools/callTool.ts` | 增加 teams 工具调用 |
| `core/protocol/core.ts` | 扩展通信协议 |

---

## 七、风险与注意事项

1. **性能风险**：多 Expert 并行调用会产生大量 LLM 请求，需要考虑 rate limiting 和成本控制
2. **上下文窗口**：Leader 的上下文需要容纳所有 Expert 的摘要结果，可能超出模型上下文限制
3. **向后兼容**：新增 "teams" 模式不能影响现有 chat/agent/plan/background 模式的功能
4. **工具冲突**：现有内置工具的 Tool 接口需要适配 Expert 级别的权限过滤
5. **错误处理**：Expert 执行失败时 Leader 需要优雅降级（重试/换 Expert/告知用户）
6. **模型兼容性**：不是所有模型都支持复杂的多轮 tool calling，需要标记推荐模型

---

## 状态: ✅ 完整功能已实施（阶段 1-13）

### 已完成

- ✅ **阶段 1**：类型定义与模式注册 — `MessageModes` 扩展、GUI 模式选择器、系统消息
- ✅ **阶段 2**：Expert 定义与 Prompt 管理 — 类型接口、5 个内置 prompt、加载器、注册表
- ✅ **阶段 3**：任务管理系统 — TaskManager CRUD + 6 个 Leader 编排工具
- ✅ **阶段 4**：编排引擎 — TeamsOrchestrator、ExpertExecutor、工具实现、callTool 集成
- ✅ **阶段 5**：GUI 集成 — Redux teamsState、stream 流适配
- ✅ **阶段 6**：新增专家角色 — verify-expert、code-review-expert（共 7 个角色）
- ✅ **阶段 7**：单元测试 — 63 个测试覆盖 taskManager、promptLoader、orchestrator、expertExecutor
- ✅ **阶段 8**：GUI 组件 — ExpertPanel.tsx（专家状态面板）、TaskBoard.tsx（任务看板）
- ✅ **阶段 9**：通信协议 — teamsStateUpdate 消息、useWebviewListener 集成
- ✅ **阶段 10**：真正的 Sub-Agent LLM 执行循环 — subAgentRunner.ts 独立 LLM 会话 + 工具调用循环
- ✅ **阶段 11**：并行调度支持 — parallelDispatcher.ts Promise.allSettled 多专家并行
- ✅ **阶段 12**：状态广播器 — stateBroadcaster.ts 编排器事件→GUI teamsStateUpdate
- ✅ **阶段 13**：新增测试 — 共 80 个测试（6 个测试文件），覆盖 subAgentRunner + stateBroadcaster
- ✅ **阶段 14**：Sub-Agent 执行可视化 — SubAgentActivity.tsx 可折叠执行详情查看器
  - SubAgentStep 类型定义、协议扩展、Redux 状态扩展
  - subAgentRunner 执行过程中实时广播 tool_call/text 步骤
  - SubAgentActivity.tsx：每个专家可折叠面板，默认收起，点击展开执行步骤
  - 工具调用步骤显示名称+成功/失败图标，点击查看参数和结果
  - 共 89 个测试（新增 9 个：addExpertStep + step broadcasting）

### 待实现（后续迭代）

- ⏳ 配置持久化（用户自定义专家、YAML 配置）
- ⏳ Teams Session 持久化（任务看板状态在会话中持久化）
