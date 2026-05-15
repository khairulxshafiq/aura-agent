// tools/modelRouter.js

export function chooseModel(task = "") {

  const lower = task.toLowerCase();

  // CODING
  if (
    lower.includes("code") ||
    lower.includes("bug") ||
    lower.includes("error") ||
    lower.includes("logs") ||
    lower.includes("debug")
  ) {

    return {
      provider: "openrouter",
      model: "deepseek/deepseek-chat-v3-0324",
      reason: "Cheap and powerful for coding/debugging"
    };
  }

  // CREATIVE
  if (
    lower.includes("caption") ||
    lower.includes("creative") ||
    lower.includes("marketing") ||
    lower.includes("campaign")
  ) {

    return {
      provider: "openrouter",
      model: "google/gemini-2.0-flash-001",
      reason: "Creative + cheap"
    };
  }

  // RESEARCH
  if (
    lower.includes("research") ||
    lower.includes("analyze") ||
    lower.includes("trend")
  ) {

    return {
      provider: "openrouter",
      model: "anthropic/claude-3.5-sonnet",
      reason: "Strong reasoning and analysis"
    };
  }

  // DEFAULT
  return {
    provider: "openrouter",
    model: "google/gemini-2.0-flash-001",
    reason: "Fast cheap fallback"
  };
}
