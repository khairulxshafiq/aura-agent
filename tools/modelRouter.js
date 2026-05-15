export function chooseModel(task) {
  if (!task) task = "";
  var lower = task.toLowerCase();

  var isCoding = lower.includes("code") || lower.includes("bug") || lower.includes("error") || lower.includes("logs") || lower.includes("debug") || lower.includes("fix") || lower.includes("api") || lower.includes("deploy");

  var isResearch = lower.includes("research") || lower.includes("analyze") || lower.includes("trend") || lower.includes("report");

  var isCreative = lower.includes("caption") || lower.includes("creative") || lower.includes("marketing") || lower.includes("campaign") || lower.includes("content") || lower.includes("copywriting");

  if (isCoding) {
    return { model: "deepseek/deepseek-chat-v3-0324", reason: "Cheap and powerful for coding" };
  }

  if (isResearch) {
    return { model: "google/gemini-2.0-flash-001", reason: "Strong reasoning fast cheap" };
  }

  if (isCreative) {
    return { model: "google/gemini-2.0-flash-001", reason: "Creative and cheap" };
  }

  return { model: "google/gemini-2.0-flash-001", reason: "Fast cheap fallback" };
}
