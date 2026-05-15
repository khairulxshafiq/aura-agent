export function chooseModel(task) {
  var t = "";
  if (task) { t = task.toLowerCase(); }

  var isCoding = (t.indexOf("code") > -1) || (t.indexOf("bug") > -1) || (t.indexOf("error") > -1) || (t.indexOf("logs") > -1) || (t.indexOf("debug") > -1) || (t.indexOf("fix") > -1) || (t.indexOf("api") > -1) || (t.indexOf("deploy") > -1);

  var isResearch = (t.indexOf("research") > -1) || (t.indexOf("analyze") > -1) || (t.indexOf("trend") > -1) || (t.indexOf("report") > -1);

  var isCreative = (t.indexOf("caption") > -1) || (t.indexOf("creative") > -1) || (t.indexOf("marketing") > -1) || (t.indexOf("campaign") > -1) || (t.indexOf("content") > -1) || (t.indexOf("copywriting") > -1);

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
