import { MediaType, ModelProvider } from "../types.js";

export const AliyunCodingPlan: ModelProvider = {
  models: [
    {
      model: "qwen3-coder-plus",
      displayName: "Qwen3 Coder Plus",
      contextLength: 262144,
      maxCompletionTokens: 65536,
      description:
        "Alibaba's coding-optimized model with strong code generation capabilities.",
      recommendedFor: ["chat"],
    },
    {
      model: "qwen3-coder-next",
      displayName: "Qwen3 Coder Next",
      contextLength: 262144,
      maxCompletionTokens: 65536,
      description:
        "Next generation of Alibaba's coding model with enhanced reasoning.",
      recommendedFor: ["chat"],
    },
    {
      model: "qwen3.5-plus",
      displayName: "Qwen3.5 Plus",
      contextLength: 131072,
      maxCompletionTokens: 16384,
      description:
        "Alibaba's latest general-purpose model with image understanding support.",
      mediaTypes: [MediaType.Text, MediaType.Image],
      recommendedFor: ["chat"],
    },
    {
      model: "qwen3-max-2026-01-23",
      displayName: "Qwen3 Max",
      contextLength: 131072,
      maxCompletionTokens: 16384,
      description: "Alibaba's max-capability model for complex tasks.",
      recommendedFor: ["chat"],
    },
    {
      model: "kimi-k2.5",
      displayName: "Kimi K2.5",
      contextLength: 131072,
      maxCompletionTokens: 16384,
      description:
        "Moonshot AI's Kimi K2.5 with image understanding, available via Coding Plan.",
      mediaTypes: [MediaType.Text, MediaType.Image],
      recommendedFor: ["chat"],
    },
    {
      model: "glm-5",
      displayName: "GLM-5",
      contextLength: 131072,
      maxCompletionTokens: 16384,
      description: "Zhipu AI's GLM-5 flagship model, available via Coding Plan.",
      recommendedFor: ["chat"],
    },
    {
      model: "glm-4.7",
      displayName: "GLM-4.7",
      contextLength: 131072,
      maxCompletionTokens: 16384,
      description: "Zhipu AI's GLM-4.7 model, available via Coding Plan.",
      recommendedFor: ["chat"],
    },
    {
      model: "MiniMax-M2.5",
      displayName: "MiniMax M2.5",
      contextLength: 204800,
      maxCompletionTokens: 16384,
      description:
        "MiniMax M2.5 model with strong reasoning, available via Coding Plan.",
      recommendedFor: ["chat"],
    },
  ],
  id: "aliyun-coding-plan",
  displayName: "Alibaba Cloud Coding Plan",
};
