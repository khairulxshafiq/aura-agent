// ============================================================
// AURA v4.1 — Orchestrator (The Brain)
// File: orchestrator.js (root)
// ALL 19 Airtable fields restored
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
  finance:
    "AURA Finance agent. Pricing, costs, ROI, budgets. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  sales:
    "AURA Sales agent. Quotations, customer replies, CRM. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  marketing:
    "AURA Marketing agent. Campaigns, ads, market analysis. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  training:
    "AURA Training agent. SOPs, modules, quizzes. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  ops:
    "AURA Ops agent. Scheduling, logistics, status. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  architect:
    "AURA Architect agent. Tech, debugging, APIs, infrastructure. Casual Malay/English. NEVER return JSON. Default language: Malay.",
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
  if (msg.includes("generate image") || msg.includes("buat gambar") || msg.includes("/image") || msg.includes("/img")) return "image";
  if (msg.includes("search") || msg.includes("cari") || msg.includes("trend") || msg.includes("berita") || msg.includes("/search") || msg.includes("/research")) return "research";
  if (msg.includes("code") || msg.includes("debug") || msg.includes("error") || msg.includes("bug") || msg.includes("/code")) return "coding";
  if (msg.includes("caption") || msg.includes("content") || msg.includes("tulis") || msg.includes("sakluma") || msg.includes("keelyn") || msg.includes("/content") || msg.includes("copywriting") || msg.includes("marketing")) return "content";
  if (msg.includes("finance") || msg.includes("kewangan") || msg.includes("kira") || msg.includes("budget") || msg.includes("pricing") || msg.includes("/finance")) return "finance";

  if (msg.length < 50) return "simple_chat";
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

  console.log("");
  console.log("=================================");
  console.log("MODEL ROUTER");
  console.log("TASK TYPE: " + taskType.substring(0, 80));
  console.log("MODEL: " + selected.model);
  console.log("REASON: " + selected.reason);
  console.log("=================================");

  var result = await chatCompletion({
    model: selected.model,
    messages: [{ role: "user", content: userMessage }],
    systemPrompt: systemPrompt,
    temperature: 0.7,
    maxTokens: 1500
  });

  if (result.success) {
    console.log("MODEL RESPONSE SUCCESS (" + (result.model || selected.model) + ")");
    return result.content;
  }

  if (result.suggestFallback || result.error === "RATE_LIMIT") {
    console.log("[LLM] Rate limit, trying free fallback...");
    var fallback = await chatCompletion({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: userMessage }],
      systemPrompt: systemPrompt,
      temperature: 0.7,
      maxTokens: 1500
    });
    if (fallback.success) return fallback.content;
  }

  console.error("LLM FAILED: " + result.error);
  return "Eh sorry, technical issue jap. Cuba lagi!";
}

// ============================================================
// CASUAL DETECTION
// ============================================================
function isCasualMessage(text) {
  var casual = [
    "hi","hello","hey","yo","sup","helo","hai",
    "ok","okay","k","noted","okey",
    "thanks","terima kasih","tq","ty","thank",
    "bye","bye2","tata",
    "test","testing","boleh","boleh ke","boleh guna",
    "apa khabar","how are you","good morning","selamat pagi","morning",
    "good night","selamat malam","haha","lol","wkwk",
    "nice","cool","best","gempak",
    "ya","yep","yup","yes","no","tak","nope"
  ];
  var lower = (text || "").toLowerCase().trim();
  for (var i = 0; i < casual.length; i++) if (lower === casual[i]) return true;
  if (lower.length < 20) {
    for (var j = 0; j < casual.length; j++) if (lower.indexOf(casual[j]) === 0) return true;
  }
  return false;
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

  // IMAGE ANALYSIS
  if (a.includes("use analyzeimage") || a.includes("analyze image") || a.includes("analisis gambar") || a.includes("analyze this image")) {
    console.log("[Engine] " + agentName + " -> analyzeImage");
    var imageInput = "";
    if (context && context.imageBase64) imageInput = context.imageBase64;
    else if (params.imageUrl) imageInput = params.imageUrl;
    else if (params.url) imageInput = params.url;

    var question = params.question || (context && context.originalTask) || "Analyze this image in detail.";
    var visionResult = await openRouterAnalyzeImage(imageInput, question);
    if (visionResult.success) return visionResult.content;
    return await analyzeImage(imageInput, question);
  }

  // WEB SEARCH
  if (a.includes("use websearch") || a.includes("search internet") || a.includes("cari info")) {
    var q = params.query || params.topic || (context && context.originalTask) || action;
    console.log("[Engine] " + agentName + " -> webSearch (Firecrawl): " + q);

    var searchResult = await firecrawlSearch(q, { depth: "high", maxResults: 5 });
    if (searchResult.success) return "Search Results:\n" + searchResult.content;

    console.log("[Engine] Firecrawl failed, fallback to Tavily...");
    var r = await webSearch(q);
    var answer = (r && r.answer) ? r.answer : "";
    var sources = "";
    if (r && r.results && r.results.length > 0) {
      sources = r.results.map(function(x) { return "- " + x.title + ": " + x.snippet; }).join("\n");
    }
    return "Search Results:\n" + answer + "\n\nSources:\n" + sources;
  }

  // RESEARCH
  if (a.includes("use research") || a.includes("deep analysis")) {
    console.log("[Engine] " + agentName + " -> research");
    return await research(params.topic || (context && context.originalTask) || action);
  }

  // IMAGE GENERATION
  if (a.includes("use generateimage") || a.includes("buat gambar") || a.includes("create image") || a.includes("generate image")) {
    var imgPrompt = params.prompt || params.description || action.replace(/use generateimage:?\s*/i, "");
    console.log("IMAGE GENERATION: " + imgPrompt);
    var imgUrl = await generateImage(imgPrompt, { width: 1024, height: 1024 });
    if (imgUrl) return "Gambar siap!\n\n" + imgUrl;
    return "Gambar tak berjaya. Cuba lagi?";
  }

  // WRITE CONTENT
  if (a.includes("use writecontent") || a.includes("tulis artikel") || a.includes("buat content") || a === "writecontent") {
    console.log("[Engine] " + agentName + " -> writeContent");
    return await writeContent(
      params.brief || (context && context.originalTask) || action,
      params.style || "casual",
      params.platform || "general"
    );
  }

  // CAPTION
  if (a.includes("use generatecaption") || a.includes("buat caption") || a.includes("caption ig") || a === "generatecaption") {
    console.log("[Engine] " + agentName + " -> generateCaption");
    return await generateCaption(
      params.topic || (context && context.originalTask) || action,
      params.platform || "facebook",
      params.mood || "engaging"
    );
  }

  // CONTENT PIPELINE
  if (a.includes("use contentpipeline") || a.includes("content pipeline")) {
    console.log("[Engine] " + agentName + " -> contentPipeline");
    var pipeUrl = params.url || action.match(/https?:\/\/[^\s]+/);
    if (pipeUrl) {
      if (typeof pipeUrl !== "string") pipeUrl = pipeUrl[0];
      var pipeResult = await processContentPipeline(pipeUrl);
      if (pipeResult.success) {
        var pipeText = "Content Pipeline Complete!\n\n";
        var plats = pipeResult.platforms;
        if (plats.fb && plats.fb.success) pipeText += "=== FACEBOOK ===\n" + plats.fb.content + "\n\n";
        if (plats.threads && plats.threads.success) pipeText += "=== THREADS ===\n" + plats.threads.content + "\n\n";
        if (plats.x && plats.x.success) pipeText += "=== X/TWITTER ===\n" + plats.x.content + "\n\n";
        return pipeText;
      }
      return "Pipeline gagal: " + pipeResult.error;
    }
    return "Sila bagi URL. Contoh: /pipeline https://rotikaya.com/article";
  }

  // ============================================================
  // AIRTABLE: CREATE DRAFT (ALL 19 FIELDS)
  // ============================================================
  if (a.includes("use airtablecreate") || a.includes("save to airtable") || a.includes("airtable create") || a === "airtablecreate") {
    console.log("[Engine] " + agentName + " -> airtableCreate");

    var captionValue = params.caption || params.Caption || "";
    if (!captionValue && context && context.lastResult) captionValue = context.lastResult;

    var titleValue = params.title || params.Title || "";
    if (!titleValue && context && context.originalTask) titleValue = context.originalTask.substring(0, 80);

    var fields = {
      "Title":               titleValue || "Untitled",
      "Caption":             captionValue || "",
      "Image URL":           params.imageUrl || params["Image URL"] || "",
      "Platform":            params.platform || params.Platform || "Facebook",
      "Status":              params.status || params.Status || "Draft",
      "Scheduled Date":      params.scheduledDate || params["Scheduled Date"] || null,
      "Created By":          params.createdBy || params["Created By"] || (context && context.from) || "AURA",
      "Notes":               params.notes || params.Notes || "",
      "Post Link":           params.postLink || params["Post Link"] || "",
      "Content Type":        params.contentType || params["Content Type"] || "Image",
      "AI Caption":          params.aiCaption || params["AI Caption"] || captionValue || "",
      "AI Hashtags":         params.aiHashtags || params["AI Hashtags"] || "",
      "AI Content Insights": params.aiInsights || params["AI Content Insights"] || "",
      "Hashtags":            params.hashtags || params.Hashtags || "",
      "Video URL":           params.videoUrl || params["Video URL"] || "",
      "Campaign":            params.campaign || params.Campaign || "",
      "Brand":               params.brand || params.Brand || "Sakluma",
      "Approved By":         params.approvedBy || params["Approved By"] || "",
      "Posted Link":         params.postedLink || params["Posted Link"] || ""
    };

    var cleaned = {};
    for (var fk in fields) {
      if (fields[fk] !== null && fields[fk] !== undefined && fields[fk] !== "") {
        cleaned[fk] = fields[fk];
      }
    }

    try {
      var rec = await airtableCreate(cleaned);
      return "✅ Saved to Airtable (Draft)\nRecord ID: " + rec.id;
    } catch (err) {
      console.error("[AirtableCreate] Failed:", err.message);
      return "❌ Airtable save failed: " + err.message;
    }
  }

  // ============================================================
  // AIRTABLE: UPDATE RECORD
  // ============================================================
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

  // ============================================================
  // AIRTABLE: FIND LATEST DRAFT
  // ============================================================
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

  // NO TOOL -> LLM FALLBACK
  console.log("[Engine] " + agentName + " -> LLM fallback");
  var role = AGENT_ROLES[agentName] || "Helpful assistant. Casual Malay. NEVER return JSON.";
  var originalInfo = context && context.originalTask ? "\nOriginal request: " + context.originalTask : "";
  return await callLLM(role, "TASK: " + action + originalInfo + "\nReply casual in Malay. Do NOT return JSON.", action);
}

// ============================================================
// PLANNER
// ============================================================
async function planTask(understanding, memories, task) {
  if (isCasualMessage(task)) {
    console.log("Fast path: casual");
    return [{ step: 1, agent: "content", action: "casual reply to: " + task, params: {}, description: "Chat", depends_on: null }];
  }

  var mem = "";
  if (memories && memories.length > 0) {
    var memItems = memories.slice(0, 3).map(function(m) { return "- " + m.task; });
    mem = "\nMEMORIES:\n" + memItems.join("\n");
  }

  var planResponse = await callLLM(
    BOSS_PLAN_PROMPT,
    "Plan for this. Return ONLY JSON array.\nREQUEST: " + task + "\nUNDERSTANDING: " + understanding + mem + "\nIf tool needed, include use [toolName] in action.",
    task
  );

  try {
    var match = planResponse.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]).slice(0, 4);
    return JSON.parse(planResponse).slice(0, 4);
  } catch (err) {
    console.error("Plan parse failed: " + err.message);
    return [{ step: 1, agent: "content", action: "respond to: " + task, params: {}, description: "Direct", depends_on: null }];
  }
}

// ============================================================
// BOSS APPROVE + REVIEW
// ============================================================
async function bossApprove(step) {
  var d = await callLLM(BOSS_CHAT_PROMPT, "Reply PROCEED or SKIP (1 word + 1 sentence reason).\nSTEP: " + JSON.stringify(step), "approve");
  console.log("Boss: " + d.substring(0, 80));
  return d.toUpperCase().indexOf("SKIP") !== 0;
}

async function bossReview(task, results) {
  var txt = results.map(function(r) { return "[" + r.agent + "]: " + r.result; }).join("\n\n");
  return await callLLM(BOSS_CHAT_PROMPT, "Write a final response for Matrol based on these results.\nOriginal request: " + task + "\n\nResults:\n" + txt + "\n\nWrite like a friend. Casual Malay. Do NOT return JSON.", task);
}

// ============================================================
// HANDLER: Usage Report
// ============================================================
async function handleReport() {
  var stats = await getUsageStats();
  var report = getCostReport();

  var text = "\uD83D\uDCCA *AURA Usage Report*\n";
  text += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n";
  text += "\uD83D\uDCC5 Date: " + report.lastReset + "\n";
  text += "\uD83D\uDCE8 Requests: " + report.requestCount + "\n";
  text += "\uD83D\uDCB0 Cost Today: $" + report.dailyTotal.toFixed(4) + "\n";
  text += "\uD83D\uDCB3 Budget: $" + report.budget.toFixed(2) + "\n";
  text += "\uD83D\uDFE2 Remaining: $" + report.remaining.toFixed(4) + "\n";
  text += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n";

  var breakdown = report.modelBreakdown;
  if (Object.keys(breakdown).length > 0) {
    text += "\n\uD83E\uDD16 *Model Breakdown:*\n";
    for (var model in breakdown) {
      var shortName = model.split("/").length > 1 ? model.split("/")[1] : model;
      var pct = report.requestCount > 0 ? ((breakdown[model].count / report.requestCount) * 100).toFixed(0) : 0;
      text += "\u2022 " + shortName + ": " + breakdown[model].count + " (" + pct + "%) \u2014 $" + breakdown[model].cost.toFixed(4) + "\n";
    }
  }

  if (stats.credits && stats.credits.data) {
    text += "\n\uD83D\uDC8E *OpenRouter Credits:*\n";
    text += "\u2022 Balance: $" + (stats.credits.data.balance || 0).toFixed(4) + "\n";
  }

  return text;
}

// ============================================================
// CONTENT PIPELINE
// ============================================================
export async function processContentPipeline(url, options) {
  if (!options) options = {};
  var brand = options.brand || "Sakluma";
  var platforms = options.platforms || ["fb", "threads", "x"];

  console.log("[Pipeline] URL: " + url + " | Platforms: " + platforms.join(", "));

  var scrapeResult = await firecrawlSearch(
    "Read and summarize the full content of this article: " + url,
    { model: "google/gemini-2.5-flash", depth: "high", maxResults: 1, maxTokens: 4096 }
  );

  if (!scrapeResult.success) return { success: false, error: "Failed to scrape: " + scrapeResult.error };

  var articleContent = scrapeResult.content;
  var results = {};

  var formats = {
    fb: "Facebook post (panjang, storytelling, engaging, emoji). Hook at start. 3-5 paragraphs. Call-to-action.",
    threads: "Threads post (pendek, punchy, conversational, max 500 chars). Hot take style.",
    x: "X/Twitter post (max 280 chars, sharp, 2-3 hashtags). Quotable.",
    ig: "Instagram caption (medium length, aesthetic, emojis). 5-10 hashtags."
  };

  for (var p = 0; p < platforms.length; p++) {
    var platform = platforms[p];
    var format = formats[platform] || formats.fb;

    var prompt =
      "Based on this article, create a " + format +
      "\n\nBrand: " + brand +
      "\nTone: Casual Malaysian, relatable, modern" +
      "\n\nArticle content:\n" + articleContent;

    var contentResult = await chatCompletion({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: prompt }],
      systemPrompt: "You are a social media content expert for " + brand + ". Create engaging content in Bahasa Malaysia.",
      maxTokens: 2048,
      temperature: 0.85
    });

    results[platform] = { success: contentResult.success, content: contentResult.content, model: contentResult.model };
  }

  return { success: true, originalSummary: articleContent.substring(0, 500) + "...", platforms: results };
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
      return { response: reportText, result: reportText, duration: Date.now() - start, stepsExecuted: 1, totalSteps: 1, agents: ["system"] };
    }

    if (taskType === "content_pipeline") {
      var urlMatch = task.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        var pipeResult = await processContentPipeline(urlMatch[0]);
        if (pipeResult.success) {
          var pipeText = "\uD83D\uDCF0 *Content Pipeline Complete*\n\n";
          if (pipeResult.platforms.fb && pipeResult.platforms.fb.success) pipeText += "\uD83D\uDCD8 *Facebook:*\n" + pipeResult.platforms.fb.content + "\n\n";
          if (pipeResult.platforms.threads && pipeResult.platforms.threads.success) pipeText += "\uD83E\uDDF5 *Threads:*\n" + pipeResult.platforms.threads.content + "\n\n";
          if (pipeResult.platforms.x && pipeResult.platforms.x.success) pipeText += "\uD835\uDD4F *X/Twitter:*\n" + pipeResult.platforms.x.content + "\n\n";
          pipeText += "\n\uD83D\uDD17 Source: " + urlMatch[0];
          return { response: pipeText, result: pipeText, duration: Date.now() - start, stepsExecuted: 1, totalSteps: 1, agents: ["content"] };
        }
        return { response: "Pipeline gagal: " + pipeResult.error, error: true };
      }
      return { response: "Sila bagi URL. Contoh: /pipeline https://rotikaya.com/article", error: true };
    }

    // STEP 1 - UNDERSTANDING
    console.log("STEP 1: UNDERSTANDING");
    var understanding;
    if (isCasualMessage(task)) {
      understanding = "Casual message. Reply like a friend in Malay.";
      console.log("CASUAL MESSAGE DETECTED");
    } else {
      understanding = await callLLM(BOSS_CHAT_PROMPT, "What does Matrol want? Reply in 1-2 sentences in Malay. Dont assume Sakluma.\nMessage: " + task, task);
    }
    console.log("UNDERSTANDING: " + understanding);

    // STEP 2 - MEMORY
    console.log("STEP 2: MEMORY SEARCH");
    var memories = await searchMemory(task);
    console.log("MEMORIES FOUND: " + memories.length);

    // STEP 3 - PLANNING
    console.log("STEP 3: PLANNING");
    var plan = await planTask(understanding, memories, task);

    var agentSet = {};
    for (var pp = 0; pp < plan.length; pp++) agentSet[plan[pp].agent] = true;
    var agents = Object.keys(agentSet);
    console.log("PLAN: " + plan.length + " steps, agents: " + agents.join(", "));

    // STEP 4 - EXECUTION (with lastResult pass-through)
    console.log("STEP 4: EXECUTION");
    var results = [];
    var lastResult = null;
    var sortedPlan = plan.sort(function(a, b) { return a.step - b.step; });

    for (var s = 0; s < sortedPlan.length; s++) {
      var step = sortedPlan[s];
      console.log("[" + step.agent.toUpperCase() + "] " + step.action);

      var approved = true;
      if (sortedPlan.length > 1) approved = await bossApprove(step);
      if (!approved) { console.log("STEP SKIPPED"); continue; }

      var result = await executeWithTools(step.agent, step.action, step.params || {}, {
        imageBase64: context.imageBase64 || null,
        originalTask: task,
        understanding: understanding,
        from: context.from || "Telegram",
        lastResult: lastResult
      });

      lastResult = result;
      results.push({ step: step.step, agent: step.agent, action: step.action, result: result });
      console.log("[" + step.agent + "] COMPLETE");
    }

    console.log("EXECUTED: " + results.length + "/" + plan.length);

    // STEP 5 - REVIEW
    console.log("STEP 5: FINAL REVIEW");
    var finalResponse;
    if (results.length === 0) finalResponse = "Tak dapat proses. Cuba explain lagi?";
    else if (results.length === 1) finalResponse = results[0].result;
    else finalResponse = await bossReview(task, results);

    var trimmed = (finalResponse || "").trim();
    if (trimmed.indexOf("[{") === 0 || trimmed.indexOf("```json") === 0 || trimmed.indexOf("```") === 0) {
      console.log("WARNING: JSON detected, regenerating...");
      finalResponse = await callLLM(BOSS_CHAT_PROMPT, "Matrol asked: " + task + "\n\nYour analysis:\n" + finalResponse + "\n\nRewrite as friendly casual reply in Malay. NO JSON. NO code blocks.", task);
    }

    console.log("FINAL RESPONSE READY");

    // STEP 6 - MEMORY SAVE
    console.log("STEP 6: MEMORY SAVE");
    await saveMemory(task, finalResponse);
    await logActivity("orchestrator", task, finalResponse, "success");
    console.log("MEMORY SAVED");

    var duration = Date.now() - start;
    console.log("");
    console.log("=================================");
    console.log("AURA v4.1.0 COMPLETE - " + duration + "ms");
    console.log("AGENTS: " + agents.join(", "));
    console.log("STEPS: " + results.length + "/" + plan.length);
    console.log("=================================");

    return { response: finalResponse, result: finalResponse, duration: duration, stepsExecuted: results.length, totalSteps: plan.length, agents: agents };

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
  selectModel,
  processContentPipeline
};
