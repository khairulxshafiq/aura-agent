// ============================================================
// AURA v4.1 — Orchestrator (The Brain)
// File: orchestrator.js (root)
// FIX: Airtable 422 UNKNOWN_FIELD_NAME by sending only existing fields
// ============================================================

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { chooseModel, MODELS, TASK_MODEL_MAP, COST_LIMITS } from "./tools/modelRouter.js";

import {
  chatCompletion,
  firecrawlSearch,
  openRouterAnalyzeImage,
  getCostReport,
  shouldUseFreeModel,
  getUsageStats
} from "./tools/openRouter.js";

import {
  webSearch,
  research,
  generateImage,
  analyzeImage,
  writeContent,
  generateCaption,
  searchMemory,
  saveMemory,
  logActivity,
  callToolLLM,
  airtableCreate,
  airtableUpdate,
  airtableFindByFormula,
  airtableGet
} from "./tools/index.js";

var OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ============================================================
// BOSS PLAN PROMPT
// ============================================================
var BOSS_PLAN_PROMPT =
  "You are AURA - Matrol personal AI assistant.\n\n" +
  "IDENTITY:\n" +
  "- Smart reliable friend, NOT salesperson, NOT corporate bot\n" +
  "- NEVER promote Sakluma unless asked\n\n" +
  "AVAILABLE TOOLS:\n" +
  "- webSearch: search internet (Firecrawl + Tavily)\n" +
  "- research: deep AI analysis\n" +
  "- generateImage: create AI images\n" +
  "- analyzeImage: analyze/read images with AI vision\n" +
  "- writeContent: write articles, copies, scripts\n" +
  "- generateCaption: quick social media captions\n" +
  "- contentPipeline: scrape URL and regenerate for FB/Threads/X\n" +
  "- airtableCreate: save content draft into Airtable\n" +
  "- airtableUpdate: update existing Airtable record\n" +
  "- airtableFindByFormula: find record (latest draft) in Airtable\n\n" +
  "PLANNING RULES:\n" +
  "1. CASUAL (hi, hello, thanks) -> 1 step, content agent, casual reply, NO tools\n" +
  "2. CONTENT (caption, article) -> content agent, use generateCaption or use writeContent\n" +
  "3. IMAGE GEN (buat gambar, generate) -> content agent, use generateImage: [description]\n" +
  "4. IMAGE ANALYSIS (analyze gambar) -> content agent, use analyzeImage\n" +
  "5. RESEARCH (cari info, trends) -> ops agent, use webSearch for [query]\n" +
  "6. CODING (error, bug, debug, API, code) -> coding agent, direct response\n" +
  "7. BUSINESS -> relevant agent + tools, max 4 steps\n" +
  "8. REPORT (/report, /usage, /cost) -> direct report, NO planning needed\n" +
  "9. PIPELINE (/pipeline URL) -> content agent, use contentPipeline\n" +
  "10. SAVE DRAFT -> after content generated, use airtableCreate\n" +
  "11. UPDATE DRAFT -> use airtableUpdate with recordId + fields\n\n" +
  "OUTPUT: Return ONLY valid JSON array\n" +
  '[{"step":1,"agent":"content","action":"casual reply","params":{},"description":"why","depends_on":null}]\n\n' +
  "CRITICAL:\n" +
  "- Include use [toolName] in action when tool needed\n" +
  "- Casual = NO tools. Complex = max 4 steps.\n" +
  "- NEVER over-orchestrate";

// ============================================================
// CHAT PROMPT
// ============================================================
var BOSS_CHAT_PROMPT =
  "You are AURA CORE v4.1 - Matrol personal AI operating system.\n\n" +
  "PERSONALITY:\n" +
  "- Smart, calm, helpful, efficient, human-like\n" +
  "- Casual Malay/English (Manglish)\n" +
  "- Default reply in Malay language\n\n" +
  "RULES:\n" +
  "- NEVER return JSON\n" +
  "- NEVER return code blocks unless asked\n" +
  "- NEVER say I am an AI language model\n" +
  "- NEVER promote Sakluma unless asked\n" +
  "- NEVER sound robotic\n" +
  "- Reply like a real smart friend\n" +
  "- Short for simple, detailed when needed\n" +
  "- Natural emoji usage";

// ============================================================
// AGENT ROLES
// ============================================================
var AGENT_ROLES = {
  content:
    "You are AURA Content agent. Reply in casual Malay/English. " +
    "CASUAL CHAT: Reply like a friend. Short, warm. " +
    "CONTENT: Write engaging content. NEVER return JSON. Default language: Malay.",
  ops:
    "AURA Ops agent. Scheduling, logistics, status. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  coding:
    "AURA Coding agent. Debug, code generation, log analysis, API troubleshooting. NEVER return JSON. Default language: Malay."
};

// ============================================================
// TASK TYPE DETECTION
// ============================================================
export function detectTaskType(message) {
  var msg = (message || "").toLowerCase();

  if (msg.includes("/report") || msg.includes("/usage") || msg.includes("/cost") || msg.includes("/stats")) return "report";
  if (msg.includes("/pipeline") || msg.includes("content pipeline")) return "content_pipeline";
  if (msg.includes("search") || msg.includes("cari") || msg.includes("trend") || msg.includes("/search")) return "research";
  if (msg.includes("code") || msg.includes("debug") || msg.includes("error") || msg.includes("/code")) return "coding";
  if (msg.includes("caption") || msg.includes("content") || msg.includes("tulis") || msg.includes("/content")) return "content";

  return "simple_chat";
}

// ============================================================
// MODEL SELECTION
// ============================================================
export function selectModel(taskType, attempt) {
  if (!attempt) attempt = 0;
  if (shouldUseFreeModel() && taskType !== "image") return "google/gemini-2.5-flash";

  var list = TASK_MODEL_MAP[taskType] || TASK_MODEL_MAP["default"];
  if (attempt < list.length) return list[attempt];
  return "openrouter/auto";
}

// ============================================================
// CALL LLM
// ============================================================
async function callLLM(systemPrompt, userMessage, taskType) {
  if (!taskType) taskType = "general";
  var selected = chooseModel(taskType);

  var result = await chatCompletion({
    model: selected.model,
    messages: [{ role: "user", content: userMessage }],
    systemPrompt,
    temperature: 0.7,
    maxTokens: 1500
  });

  if (result.success) return result.content;

  return "Eh sorry, technical issue jap. Cuba lagi!";
}

// ============================================================
// TOOL EXECUTION ENGINE
// ============================================================
async function executeWithTools(agentName, action, params, context) {
  var a = (action || "").toLowerCase();

  console.log("");
  console.log("---------------------------------");
  console.log("EXECUTING AGENT: " + agentName);
  console.log("ACTION: " + action);
  console.log("---------------------------------");

  // CAPTION
  if (a.includes("use generatecaption") || a.includes("generatecaption")) {
    console.log("[Engine] " + agentName + " -> generateCaption");
    return await generateCaption(
      params.topic || (context && context.originalTask) || "",
      params.platform || "facebook",
      params.mood || "engaging"
    );
  }

  // WRITE CONTENT
  if (a.includes("use writecontent") || a === "writecontent") {
    console.log("[Engine] " + agentName + " -> writeContent");
    return await writeContent(
      params.brief || (context && context.originalTask) || "",
      params.style || "casual",
      params.platform || "facebook"
    );
  }

  // ============================================================
  // ✅ AIRTABLE: CREATE DRAFT (ONLY send known existing fields)
  // ============================================================
  if (a.includes("use airtablecreate") || a.includes("save to airtable") || a.includes("airtable create") || a === "airtablecreate") {
    console.log("[Engine] " + agentName + " -> airtableCreate");

    // Auto-fill caption from previous step output if empty
    var captionValue = params.caption || params.Caption || "";
    if (!captionValue && context && context.lastResult) captionValue = context.lastResult;

    var titleValue = params.title || params.Title || "";
    if (!titleValue && context && context.originalTask) titleValue = context.originalTask.substring(0, 80);

    // ✅ ONLY fields that exist in your Airtable view/table right now
    var fields = {
      "Title": titleValue || "Untitled",
      "Caption": captionValue || "",
      "Image URL": params.imageUrl || params["Image URL"] || "",
      "Platform": params.platform || params.Platform || "Facebook",
      "Status": params.status || params.Status || "Draft",
      "Scheduled Date": params.scheduledDate || params["Scheduled Date"] || null,
      "Created By": params.createdBy || params["Created By"] || (context && context.from) || "AURA",
      "Notes": params.notes || params.Notes || ""
    };

    // Remove empty/null to reduce Airtable type errors
    var cleaned = {};
    for (var k in fields) {
      if (fields[k] !== null && fields[k] !== undefined && fields[k] !== "") cleaned[k] = fields[k];
    }

    try {
      var rec = await airtableCreate(cleaned);
      return "✅ Saved to Airtable (Draft)\nRecord ID: " + rec.id;
    } catch (err) {
      console.error("[AirtableCreate] Failed:", err.message);
      return "❌ Airtable save failed: " + err.message;
    }
  }

  // AIRTABLE: UPDATE RECORD
  if (a.includes("use airtableupdate") || a.includes("airtable update")) {
    console.log("[Engine] " + agentName + " -> airtableUpdate");
    var recordId = params.recordId || params.id;
    if (!recordId) return "❌ airtableUpdate perlukan recordId (recXXXX).";

    try {
      var updated = await airtableUpdate(recordId, params.fields || {});
      return "✅ Updated Airtable\nRecord ID: " + updated.id;
    } catch (err2) {
      console.error("[AirtableUpdate] Failed:", err2.message);
      return "❌ Airtable update failed: " + err2.message;
    }
  }

  // AIRTABLE: FIND LATEST DRAFT
  if (a.includes("use airtablefindbyformula") || a.includes("find latest draft")) {
    console.log("[Engine] " + agentName + " -> airtableFindByFormula");
    try {
      var res = await airtableFindByFormula('{Status}="Draft"', { maxRecords: 1 });
      if (!res.records || res.records.length === 0) return "❌ Tak jumpa Draft.";
      return "✅ Latest Draft Found\nRecord ID: " + res.records[0].id;
    } catch (err3) {
      console.error("[AirtableFind] Failed:", err3.message);
      return "❌ Airtable find failed: " + err3.message;
    }
  }

  // LLM FALLBACK
  console.log("[Engine] " + agentName + " -> LLM fallback");
  var role = AGENT_ROLES[agentName] || "Helpful assistant. Casual Malay. NEVER return JSON.";
  var originalInfo = context && context.originalTask ? "\nOriginal request: " + context.originalTask : "";
  return await callLLM(role, "TASK: " + action + originalInfo + "\nReply casual in Malay. Do NOT return JSON.", action);
}

// ============================================================
// PLANNER
// ============================================================
async function planTask(understanding, memories, task) {
  if ((task || "").length < 20) {
    return [{ step: 1, agent: "content", action: "casual reply", params: {}, description: "Chat", depends_on: null }];
  }

  var planResponse = await callLLM(
    BOSS_PLAN_PROMPT,
    "Plan for this. Return ONLY JSON array.\nREQUEST: " + task + "\nUNDERSTANDING: " + understanding + "\nIf tool needed, include use [toolName] in action.",
    task
  );

  try {
    var match = planResponse.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]).slice(0, 4);
    return JSON.parse(planResponse).slice(0, 4);
  } catch (err) {
    return [{ step: 1, agent: "content", action: "use generateCaption", params: { topic: task, platform: "facebook" }, description: "Fallback", depends_on: null }];
  }
}

// ============================================================
// BOSS APPROVE
// ============================================================
async function bossApprove(step) {
  var d = await callLLM(BOSS_CHAT_PROMPT, "Reply PROCEED or SKIP.\nSTEP: " + JSON.stringify(step), "approve");
  return d.toUpperCase().indexOf("SKIP") !== 0;
}

// ============================================================
// REPORT (optional)
// ============================================================
async function handleReport() {
  var report = getCostReport();
  return "📊 Usage today: $" + report.dailyTotal.toFixed(4) + " | Requests: " + report.requestCount;
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================
export async function runOrchestrator(task, context) {
  if (!context) context = {};
  var start = Date.now();

  console.log("");
  console.log("=================================");
  console.log("AURA v4.1.0 ORCHESTRATOR START");
  console.log("USER TASK: " + task);
  console.log("TIME: " + new Date().toISOString());
  console.log("=================================");

  try {
    var taskType = detectTaskType(task);

    if (taskType === "report") {
      var reportText = await handleReport();
      return { response: reportText, result: reportText };
    }

    console.log("STEP 1: UNDERSTANDING");
    var understanding = await callLLM(BOSS_CHAT_PROMPT, "Ringkaskan apa user nak dalam 1 ayat.\nMessage: " + task, task);

    console.log("STEP 2: MEMORY SEARCH");
    var memories = await searchMemory(task);

    console.log("STEP 3: PLANNING");
    var plan = await planTask(understanding, memories, task);

    console.log("STEP 4: EXECUTION");
    var results = [];
    var lastResult = null;

    for (var s = 0; s < plan.length; s++) {
      var step = plan[s];

      var approved = true;
      if (plan.length > 1) approved = await bossApprove(step);
      if (!approved) continue;

      var result = await executeWithTools(step.agent, step.action, step.params || {}, {
        originalTask: task,
        understanding,
        from: context.from || "Telegram",
        imageBase64: context.imageBase64 || null,
        lastResult
      });

      lastResult = result;
      results.push({ step: step.step, agent: step.agent, action: step.action, result });
    }

    console.log("STEP 5: FINAL RESPONSE");
    var finalResponse = results.length > 0 ? results[results.length - 1].result : "Tak dapat proses. Cuba lagi.";

    console.log("STEP 6: MEMORY SAVE");
    await saveMemory(task, finalResponse);
    await logActivity("orchestrator", task, finalResponse, "success");

    return { response: finalResponse, result: finalResponse };

  } catch (error) {
    console.error("ORCHESTRATOR FAILED: " + (error.message || error));
    return { response: "Aduhh ada issue technical. Cuba lagi jap.", error: true };
  }
}

export async function processMessage(userMessage, context) {
  return await runOrchestrator(userMessage, context);
}

export default {
  runOrchestrator,
  processMessage,
  detectTaskType,
  selectModel
};
