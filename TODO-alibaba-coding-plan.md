# 阿里云百炼 Coding Plan 适配计划

## 背景信息

阿里云百炼 Coding Plan 是专为 AI 编程场景设计的订阅型 API 服务，兼容 OpenAI API 协议。

### API 关键信息
- **OpenAI 兼容 Base URL**: `https://coding.dashscope.aliyuncs.com/v1`
- **Anthropic 兼容 Base URL**: `https://coding.dashscope.aliyuncs.com/apps/anthropic`
- **API Key 格式**: `sk-sp-xxxxx`（专属 Key，与普通按量计费 Key 不通用）
- **支持的模型**: qwen3.5-plus, kimi-k2.5, glm-5, MiniMax-M2.5, qwen3-max-2026-01-23, qwen3-coder-next, qwen3-coder-plus, glm-4.7 等

### 协议兼容性
- 完全兼容 OpenAI Chat Completions API (`/v1/chat/completions`)
- 支持流式输出 (SSE)
- 支持 Tool Calling

---

## 适配方案

由于 Coding Plan 完全兼容 OpenAI API 协议，适配方案参考 Deepseek/SiliconFlow 等已有 provider 的模式：**继承 OpenAI 类，仅覆盖 Base URL 和默认配置。**

---

## 改造文件清单与进度追踪

### 1. 核心 LLM Provider 类 (core/llm/llms/)
- [ ] **新建** `core/llm/llms/AliyunCodingPlan.ts` — 主 Provider 类，继承 OpenAI
  - 设置 `static providerName = "aliyun-coding-plan"`
  - 设置默认 `apiBase = "https://coding.dashscope.aliyuncs.com/v1"`
  - 设置默认模型为 `qwen3-coder-plus`
  - 设置 `useLegacyCompletionsEndpoint = false`

### 2. LLM Provider 注册 (core/llm/llms/index.ts)
- [ ] **修改** `core/llm/llms/index.ts` — 导入 AliyunCodingPlan 并添加到 `LLMClasses` 数组

### 3. OpenAI Adapters 层 (packages/openai-adapters/)
- [ ] **修改** `packages/openai-adapters/src/index.ts` — 在 `constructLlmApi` 的 switch 语句中添加 `"aliyun-coding-plan"` case
  - 使用 `openAICompatible("https://coding.dashscope.aliyuncs.com/v1", config)` 即可

### 4. 自动检测与模板 (core/llm/autodetect.ts)
- [ ] **修改** `core/llm/autodetect.ts` — 在 `PROVIDER_HANDLES_TEMPLATING` 数组中添加 `"aliyun-coding-plan"`
- [ ] **修改** `core/llm/autodetect.ts` — 在 `PROVIDER_SUPPORTS_IMAGES` 数组中添加 `"aliyun-coding-plan"`（qwen3.5-plus 和 kimi-k2.5 支持图片理解）
- [ ] **修改** `core/llm/autodetect.ts` — 在 `isProviderHandlesTemplatingOrNoTemplateTypeRequired` 函数中添加 qwen 相关模型名匹配

### 5. 模型信息 (packages/llm-info/)
- [ ] **新建** `packages/llm-info/src/providers/aliyunCodingPlan.ts` — 定义模型信息列表
  - 包含 qwen3.5-plus, kimi-k2.5, glm-5, MiniMax-M2.5, qwen3-coder-next, qwen3-coder-plus 等
  - 标注 contextLength 和 maxCompletionTokens
- [ ] **修改** `packages/llm-info/src/index.ts` — 导入并添加到 `allModelProviders`

### 6. GUI 配置面板 (gui/src/pages/AddNewModel/)
- [ ] **修改** `gui/src/pages/AddNewModel/configs/models.ts` — 添加 Coding Plan 可用模型定义
- [ ] **修改** `gui/src/pages/AddNewModel/configs/providers.ts` — 添加 `aliyun-coding-plan` provider 配置
  - title: "Alibaba Cloud Coding Plan (百炼)"
  - icon: 需要添加 icon 图片
  - 收集 API Key 输入
  - 链接到帮助文档

### 7. 图标资源
- [ ] **新增** provider icon 图片到 GUI 资源目录（可复用 qwen.png 或新增 aliyun.png）

### 8. YAML 配置支持 (packages/config-yaml/)
- [ ] **修改** `packages/config-yaml/src/schemas/models.ts` — 确认 provider 字符串 "aliyun-coding-plan" 被 schema 接受（当前使用 `z.string()` 所以无需修改）

### 9. 文档
- [ ] 添加用户配置示例文档（如何在 config.yaml 或 config.json 中配置 Coding Plan）

---

## 用户配置示例（预览）

### YAML 配置格式 (config.yaml)
```yaml
models:
  - name: Alibaba Cloud Coding Plan
    provider: aliyun-coding-plan
    model: qwen3-coder-plus
    apiKey: sk-sp-xxxxx
```

### JSON 配置格式 (config.json)
```json
{
  "models": [
    {
      "title": "Alibaba Cloud Coding Plan",
      "provider": "aliyun-coding-plan",
      "model": "qwen3-coder-plus",
      "apiKey": "sk-sp-xxxxx",
      "apiBase": "https://coding.dashscope.aliyuncs.com/v1"
    }
  ]
}
```

---

## 技术风险与注意事项

1. **API Key 隔离**: Coding Plan 的 API Key (`sk-sp-xxxxx`) 与普通百炼 API Key 不通用，需要在文档中明确说明
2. **模型列表**: Coding Plan 套餐内模型可能动态变化，需考虑支持 `/v1/models` 列表接口用于动态获取
3. **使用限制**: Coding Plan 有请求频率限制（5小时/6000次），但这不需要在客户端层面处理
4. **图片理解**: qwen3.5-plus 和 kimi-k2.5 支持图片输入，需要确保 image upload 能力正确暴露
5. **Anthropic 协议**: Coding Plan 还提供了 Anthropic 兼容协议接口，但本次适配仅使用 OpenAI 协议，Anthropic 协议可作为后续优化

---

## 工作量评估

| 任务 | 难度 | 预估时间 |
|------|------|----------|
| 核心 Provider 类 | 低 | 15 min |
| OpenAI Adapters 注册 | 低 | 5 min |
| 自动检测配置 | 低 | 10 min |
| 模型信息定义 | 中 | 20 min |
| GUI 配置面板 | 中 | 30 min |
| 图标资源 | 低 | 5 min |
| 文档 | 低 | 15 min |
| 测试验证 | 中 | 20 min |
| **总计** | | **~2 小时** |

---

## 状态: ⏳ 等待确认

请确认以上方案后开始实施。如有需要调整的地方，请提出修改意见。
