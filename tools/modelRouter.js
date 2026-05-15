// tools/modelRouter.js — AURA Dynamic Model Selection

export function chooseModel(task = "") {

  const lower = task.toLowerCase();

  //error") ||  // CODING / DEBUG
    lower.includes("logs") ||
    lower.includes("debug") ||
    lower.includes("fix") ||
    lower.includes("api") ||
    lower.includes("deploy")
  ) {
    return {
      model: "deepseek/deepseek-chat-v3-0324",
      reason: "Cheap + powerful for coding/debugging",
    };
  }

  // RESEARCH / ANALYSIS
  if (
    lower.includes("research") ||
    lower.includes("analyze") ||
    lower.includes("trend") ||
    lower.includes("report")
  ) {
    return {
      model: "google/gemini-2.0-flash-001",
      reason: "Strong reasoning, fast, cheap",
    };
  }

  // CREATIVE / CONTENT
  if (
    lower.includes("caption") ||
    lower.includes("creative") ||
    lower.includes("marketing") ||
    lower.includes("campaign") ||
    lower.includes("content") ||
    lower.includes("copywriting")
  ) {
    return {
      model: "google/gemini-2.0-flash-001",
      reason: "Creative + cheap",
    };
  }

  // DEFAULT — fast and cheap
  return {
    model: "google/gemini-2.0-flash-001",
    reason: "Fast cheap fallback",
  };
}
  if (
    lower.includes("code") ||
    lower.includes("bug") ||
