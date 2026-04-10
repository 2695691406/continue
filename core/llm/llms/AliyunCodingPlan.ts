import { LLMOptions } from "../../index.js";

import OpenAI from "./OpenAI.js";

class AliyunCodingPlan extends OpenAI {
  static providerName = "aliyun-coding-plan";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://coding.dashscope.aliyuncs.com/v1",
    model: "qwen3-coder-plus",
    useLegacyCompletionsEndpoint: false,
  };
  maxStopWords: number | undefined = 16;
}

export default AliyunCodingPlan;
