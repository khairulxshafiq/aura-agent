// ============================================================
// AURA v4.1 — Model Configuration & Router
// File: tools/modelRouter.js
// ============================================================

export const MODEL_TIERS = {
  FREE: "free",
  CHEAP: "cheap",
  MEDIUM: "medium",
  PREMIUM: "premium",
  AUTO: "auto"
};

export const MODELS = {
  "google/gemini-2.5-flash": {
    id: "google/gemini-2.5-flash",
    tier: MODEL_TIERS.FREE,
    provider: "google",
    capabilities: ["chat", "analysis", "content", "vision"],
    costInput: 0,
    costOutput: 0,
    maxTokens: 8192,
    description: "Free via BYOK. Simple chat & analysis."
  },
  "deepseek/deepseek-r1": {
    id: "deepseek/deepseek-r1",
    tier: MODEL_TIERS.CHEAP,
    provider: "deepseek",
    capabilities: ["chat", "reasoning", "coding", "research"],
    costInput: 0.55,
    costOutput: 2.19,
    maxTokens: 8192,
    description: "Deep reasoning at low cost."
  },
  "mistralai/mistral-small-3.2-24b-instruct": {
    id: "mistralai/mistral-small-3.2-24b-instruct",
    tier: MODEL_TIERS.CHEAP,
    provider: "mistral",
    capabilities: ["chat", "content", "coding"],
    costInput: 0.1,
    costOutput: 0.3,
    maxTokens: 8192,
    description: "Fast and cheap for general tasks."
  },
  "openai/gpt-4.1-mini": {
    id: "openai/gpt-4.1-mini",
    tier: MODEL_TIERS.MEDIUM,
    provider: "openai",
    capabilities: ["chat", "content", "coding", "research", "function_calling"],
    costInput: 0.4,
    costOutput: 1.6,
    maxTokens: 16384,
    description: "Good balance of quality and cost."
  },
  "anthropic/claude-haiku-4": {
    id: "anthropic/claude-haiku-4",
    tier: MODEL_TIERS.MEDIUM,
    provider: "anthropic",
    capabilities: ["chat", "content", "coding", "analysis"],
    costInput: 0.8,
    costOutput: 4.0,
    maxTokens: 8192,
    description: "Fast Claude, good for content."
  },
  "openai/gpt-4.1": {
    id: "openai/gpt-4.1",
    tier: MODEL_TIERS.PREMIUM,
    provider: "openai",
    capabilities: ["chat", "content", "coding", "research", "function_calling", "analysis"],
    costInput: 2.0,
    costOutput: 8.0,
    maxTokens: 32768,
    description: "Top-tier OpenAI. Complex research & coding."
  },
  "anthropic/claude-sonnet-4": {
    id: "anthropic/claude-sonnet-4",
    tier: MODEL_TIERS.PREMIUM,
    provider: "anthropic",
    capabilities: ["chat", "content", "coding", "research", "analysis", "creative"],
    costInput: 3.0,
    costOutput: 15.0,
    maxTokens: 16384,
    description: "Best writing & reasoning."
  },
  "google/gemini-3.1-flash-image-preview": {
    id: "google/gemini-3.1-flash-image-preview",
    tier: MODEL_TIERS.CHEAP,
    provider: "google",
    capabilities: ["image_generation"],
    costInput: 0.1,
    costOutput: 0.4,
    maxTokens: 8192,
    description: "Image generation via Gemini."
  },
  "google/gemini-2.5-flash-image": {
    id: "google/gemini-2.5-flash-image",
    tier: MODEL_TIERS.CHEAP,
    provider: "google",
    capabilities: ["image_generation"],
    costInput: 0.1,
    costOutput: 0.4,
    maxTokens: 8192,
    description: "Backup image generation."
  },
  "openrouter/auto": {
    id: "openrouter/auto",
    tier: MODEL_TIERS.AUTO,
    provider: "openrouter",
    capabilities: ["chat", "content", "coding", "research", "analysis"],
    costInput: 0,
    costOutput: 0,
    maxTokens: 16384,
    description: "OpenRouter auto-selects best model."
  }
};

export const TASK_MODEL_MAP = {
  simple_chat: [
    "google/gemini-2.5-flash",
    "mistralai/mistral-small-3.2-24b-instruct",
    "openrouter/auto"
  ],
  content: [
    "anthropic/claude-sonnet-4",
    "openai/gpt-4.1-mini",
    "google/gemini-2.5-flash",
    "openrouter/auto"
  ],
  coding: [
    "anthropic/claude-sonnet-4",
    "openai/gpt-4.1",
    "openai/gpt-4.1-mini",
    "openrouter/auto"
  ],
  research: [
    "openai/gpt-4.1",
    "anthropic/claude-sonnet-4",
    "deepseek/deepseek-r1",
    "openrouter/auto"
  ],
  finance: [
    "openai/gpt-4.1",
    "openai/gpt-4.1-mini",
    "google/gemini-2.5-flash",
    "openrouter/auto"
  ],
  analysis: [
    "openai/gpt-4.1",
    "anthropic/claude-sonnet-4",
    "deepseek/deepseek-r1",
    "openrouter/auto"
  ],
  image: [
    "google/gemini-3.1-flash-image-preview",
    "google/gemini-2.5-flash-image"
  ],
  default: [
    "google/gemini-2.5-flash",
    "openai/gpt-4.1-mini",
    "openrouter/auto"
  ]
};

export const COST_LIMITS = {
  maxCostPerRequest: 0.05,
  dailyBudget: 2.00,
  monthlyBudget: 30.00,
  preferFreeFirst: true,
  fallbackToAuto: true
};

// Backward compatible with your old chooseModel()
export function chooseModel(task) {
  var t = "";
  if (task) { t = task.toLowerCase(); }

  var isCoding = (t.indexOf("code") > -1) || (t.indexOf("bug") > -1) || (t.indexOf("error") > -1) ||
    (t.indexOf("logs") > -1) || (t.indexOf("debug") > -1) || (t.indexOf("fix") > -1) ||
    (t.indexOf("deploy") > -1) || (t.indexOf("railway") > -1) || (t.indexOf("crash") > -1);
  var isResearch = (t.indexOf("research") > -1) || (t.indexOf("analyze") > -1) ||
    (t.indexOf("trend") > -1) || (t.indexOf("report") > -1) || (t.indexOf("compare") > -1);
  var isCreative = (t.indexOf("caption") > -1) || (t.indexOf("creative") > -1) ||
    (t.indexOf("marketing") > -1) || (t.indexOf("campaign") > -1) || (t.indexOf("content") > -1) ||
    (t.indexOf("copywriting") > -1) || (t.indexOf("branding") > -1);
  var isImage = (t.indexOf("image") > -1) || (t.indexOf("gambar") > -1) ||
    (t.indexOf("poster") > -1) || (t.indexOf("photo") > -1) || (t.indexOf("visual") > -1);

  if (isCoding) { return { model: "anthropic/claude-sonnet-4", reason: "Best coding model" }; }
  if (isResearch) { return { model: "openai/gpt-4.1", reason: "Strong research & reasoning" }; }
  if (isCreative) { return { model: "anthropic/claude-sonnet-4", reason: "Best creative writing" }; }
  if (isImage) { return { model: "google/gemini-2.5-flash", reason: "Vision capable, free BYOK" }; }
  return { model: "google/gemini-2.5-flash", reason: "Free via BYOK, fast fallback" };
}

export function getModelInfo(modelId) {
  return MODELS[modelId] || null;
}

export function getModelsForTask(taskType) {
  return TASK_MODEL_MAP[taskType] || TASK_MODEL_MAP["default"];
}

export default { MODELS, TASK_MODEL_MAP, MODEL_TIERS, COST_LIMITS, chooseModel, getModelInfo, getModelsForTask };
