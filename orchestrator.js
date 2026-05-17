// ============================================================
// AURA v4.1 — Orchestrator (The Brain)
// File: orchestrator.js (root)
// MERGED: v4.0 architecture + v4.1 features + Airtable integration
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

  // ✅ Airtable tools (from tools/index.js)
  airtableCreate,
  airtableUpdate,
  airtableFindByFormula,
  airtableGet
} from "./tools/index.js";

var OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ============================================================
// BOSS PLAN PROMPT (updated with new tools + Airtable)
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
  "10. SAVE DRAFT -> after content generated, use airtableCreate with fields\n" +
  "11. UPDATE DRAFT -> use airtableUpdate with recordId + fields\n\n" +
  "OUTPUT: Return ONLY valid JSON array\n" +
  '[{"step":1,"agent":"content","action":"casual reply","params":{},"description":"why","depends_on":null}]\n\n' +
  "CRITICAL:\n" +
  "- Include use [toolName] in action when tool needed\n" +
  "- Casual = NO tools. Complex = max 4 steps.\n" +
  "- NEVER over-orchestrate";

// ============================================================
// CHAT PROMPT (Human reply, NEVER JSON)
// ============================================================
var BOSS_CHAT_PROMPT =
  "You are AURA CORE v4.1 - Matrol personal AI operating system.\n\n" +
  "PERSONALITY:\n" +
  "- Smart, calm, helpful, efficient, human-like\n" +
  "- Casual Malay/English (Manglish)\n" +
  "- Default reply in Malay language\n" +
  "- If user speaks BM, reply BM naturally\n" +
  "- If user speaks English, reply English naturally\n\n" +
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
    "CASUAL CHAT: Reply like a friend. Short, warm. NEVER mention business unless asked. " +
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
    "AURA Coding agent. Debug, code generation, log analysis, API troubleshooting, Railway, Supabase, Node.js. " +
    "Analyze carefully, identify root cause, propose production-ready fix. Casual Malay/English. NEVER return JSON. Default language: Malay."
};

// ============================================================
// TASK TYPE DETECTION
// ============================================================
export function detectTaskType(message) {
  var msg = (message || "").toLowerCase();

  var imageKw = ["generate image", "create image", "buat gambar", "generate gambar", "draw", "lukis", "poster", "/image", "/img"];
  for (var i = 0; i < imageKw.length; i++) if (msg.indexOf(imageKw[i]) > -1) return "image";

  var reportKw = ["/report", "/usage", "/cost", "/stats", "bagi report", "usage report", "cost report", "berapa guna"];
  for (var j = 0; j < reportKw.length; j++) if (msg.indexOf(reportKw[j]) > -1) return "report";

  var pipelineKw = ["/pipeline", "content pipeline", "scrape and rewrite", "ambil dari url"];
  for (var k = 0; k < pipelineKw.length; k++) if (msg.indexOf(pipelineKw[k]) > -1) return "content_pipeline";

  var researchKw = ["search", "cari", "research", "find out", "trend", "berita", "news", "cari info", "/search", "/research", "scrape"];
  for (var r = 0; r < researchKw.length; r++) if (msg.indexOf(researchKw[r]) > -1) return "research";

  var codingKw = ["code", "coding", "debug", "fix bug", "error", "bug", "deploy", "javascript", "python", "node", "/code"];
  for (var c = 0; c < codingKw.length; c++) if (msg.indexOf(codingKw[c]) > -1) return "coding";

  var contentKw = ["content", "caption", "copywriting", "write", "tulis", "sakluma", "keelyn", "marketing", "social media", "/content"];
  for (var z = 0; z < contentKw.length; z++) if (msg.indexOf(contentKw[z]) > -1) return "content";

  var financeKw = ["finance", "kewangan", "calculate", "kira", "tax", "cukai", "budget", "bajet", "pricing", "harga", "/finance"];
  for (var f = 0; f < financeKw.length; f++) if (msg.indexOf(financeKw[f]) > -1) return "finance";

  if (msg.length < 50) return "simple_chat";
  return "simple_chat";
}

// ============================================================
// MODEL SELECTION — Hybrid with Fallback
// ============================================================
export function selectModel(taskType, attempt) {
  if (!attempt) attempt = 0;
  if (shouldUseFreeModel() && taskType !== "image") return "google/gemini-2.5-flash";

  var list = TASK_MODEL_MAP[taskType] || TASK_MODEL_MAP["default"];
  if (attempt < list.length) return list[attempt];
  return "openrouter/auto";
}

// ============================================================
// CALL LLM — uses chatCompletion + fallback
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
// TOOL EXECUTION ENGINE — includes Firecrawl + Content Pipeline + Airtable
// ============================================================
async function executeWithTools(agentName, action, params, context) {
  var a = (action || "").toLowerCase();

  console.log("");
  console.log("---------------------------------");
  console.log("EXECUTING AGENT: " + agentName);
  console.log("ACTION: " + action);
  console.log("---------------------------------");

  // IMAGE ANALYSIS
  if (a.indexOf("use analyzeimage") > -1 || a.indexOf("analyze image") > -1 || a.indexOf("analisis gambar") > -1 || a.indexOf("analyze this image") > -1) {
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

  // WEB SEARCH (Firecrawl first)
  if (a.indexOf("use websearch") > -1 || a.indexOf("search internet") > -1 || a.indexOf("cari info") > -1) {
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
  if (a.indexOf("use research") > -1 || a.indexOf("deep analysis") > -1) {
    console.log("[Engine] " + agentName + " -> research");
    return await research(params.topic || (context && context.originalTask) || action);
  }

  // IMAGE GENERATION
  if (a.indexOf("use generateimage") > -1 || a.indexOf("buat gambar") > -1 || a.indexOf("create image") > -1 || a.indexOf("generate image") > -1) {
    var imgPrompt = params.prompt || params.description || action.replace(/use generateimage:?\s*/i, "");
    console.log("IMAGE GENERATION: " + imgPrompt);
    var imgUrl = await generateImage(imgPrompt, { width: 1024, height: 1024 });
    if (imgUrl) return "Gambar siap!\n\n" + imgUrl;
    return "Gambar tak berjaya. Cuba lagi?";
  }

  // WRITE CONTENT
  if (a.indexOf("use writecontent") > -1 || a.indexOf("tulis artikel") > -1 || a.indexOf("buat content") > -1) {
    console.log("[Engine] " + agentName + " -> writeContent");
    return await writeContent(params.brief || (context && context.originalTask) || action, params.style || "casual", params.platform || "general");
  }

  // CAPTION
  if (a.indexOf("use generatecaption") > -1 || a.indexOf("buat caption") > -1 || a.indexOf("caption ig") > -1) {
    console.log("[Engine] " + agentName + " -> generateCaption");
    return await generateCaption(params.topic || (context && context.originalTask) || action, params.platform || "instagram", params.mood || "engaging");
  }

  // CONTENT PIPELINE
  if (a.indexOf("use contentpipeline") > -1 || a.indexOf("content pipeline") > -1) {
    console.log("[Engine] " + agentName + " -> contentPipeline");
    var pipeUrl = params.url || action.match(/https?:\/\/[^\s]+/);
    if (pipeUrl) {
      if (typeof pipeUrl !== "string") pipeUrl = pipeUrl[0];
      var pipeResult = await processContentPipeline(pipeUrl);
      if (pipeResult.success) {
        var text = "Content Pipeline Complete!\n\n";
        var plats = pipeResult.platforms;
        if (plats.fb && plats.fb.success) text += "=== FACEBOOK ===\n" + plats.fb.content + "\n\n";
        if (plats.threads && plats.threads.success) text += "=== THREADS ===\n" + plats.threads.content + "\n\n";
        if (plats.x && plats.x.success) text += "=== X/TWITTER ===\n" + plats.x.content + "\n\n";
        return text;
      }
      return "Pipeline gagal: " + pipeResult.error;
    }
    return "Sila bagi URL. Contoh: /pipeline https://rotikaya.com/article";
  }

  // ============================================================
  // ✅ AIRTABLE: CREATE DRAFT
  // Trigger examples:
  // - "use airtableCreate"
  // - "save to airtable"
  // ============================================================
  if (a.indexOf("use airtablecreate") > -1 || a.indexOf("save to airtable") > -1 || a.indexOf("airtable create") > -1) {
    console.log("[Engine] " + agentName + " -> airtableCreate");

    var fields = {
      "Title": params.title || params.Title || "Untitled",
      "Caption": params.caption || params.Caption || "",
      "Image URL": params.imageUrl || params["Image URL"] || "",
      "Platform": params.platform || params.Platform || "Facebook",
      "Status": params.status || params.Status || "Draft",
      "Scheduled Date": params.scheduledDate || params["Scheduled Date"] || null,
      "Created By": params.createdBy || params["Created By"] || (context && context.from) || "AURA",
      "Notes": params.notes || params.Notes || "",

      "Post Link": params.postLink || params["Post Link"] || "",
      "Content Type": params.contentType || params["Content Type"] || "Post",
      "AI Caption": params.aiCaption || params["AI Caption"] || "",
      "AI Hashtags": params.aiHashtags || params["AI Hashtags"] || "",
      "Hashtags": params.hashtags || params.Hashtags || "",
      "Video URL": params.videoUrl || params["Video URL"] || "",
      "Campaign": params.campaign || params.Campaign || "",
      "Brand": params.brand || params.Brand || "Sakluma",
      "Approved By": params.approvedBy || params["Approved By"] || "",
      "Posted Link": params.postedLink || params["Posted Link"] || "",
      "AI Content Insights": params.aiInsights || params["AI Content Insights"] || ""
    };

    var rec = await airtableCreate(fields);
    return "✅ Saved to Airtable (Draft)\nRecord ID: " + rec.id;
  }

  // ✅ AIRTABLE: UPDATE RECORD
  if (a.indexOf("use airtableupdate") > -1 || a.indexOf("airtable update") > -1) {
    console.log("[Engine] " + agentName + " -> airtableUpdate");
    var recordId = params.recordId || params.id;
    if (!recordId) return "❌ airtableUpdate perlukan recordId. Contoh: { recordId: \"recXXXX\", fields: { Caption: \"...\" } }";

    var updateFields = params.fields || {};
    var updated = await airtableUpdate(recordId, updateFields);
    return "✅ Updated Airtable\nRecord ID: " + updated.id;
  }

  // ✅ AIRTABLE: FIND LATEST DRAFT (helper)
  if (a.indexOf("use airtablefindbyformula") > -1 || a.indexOf("find latest draft") > -1) {
    console.log("[Engine] " + agentName + " -> airtableFindByFormula");

    var brand = params.brand || "Sakluma";
    var platform = params.platform || "";
    var formula = 'AND({Status}="Draft",{Brand}="' + brand + '")';
    if (platform) formula = 'AND({Status}="Draft",{Brand}="' + brand + '",{Platform}="' + platform + '")';

    var res = await airtableFindByFormula(formula, { maxRecords: 1 });
    if (!res.records || res.records.length === 0) return "❌ Tak jumpa Draft lagi dalam Airtable.";

    var r = res.records[0];
    return "✅ Latest Draft Found\nRecord ID: " + r.id + "\nTitle: " + ((r.fields && r.fields.Title) ? r.fields.Title : "-");
  }

  // NO TOOL -> LLM FALLBACK
  console.log("[Engine] " + agentName + " -> LLM fallback");
  var role = AGENT_ROLES[agentName] || "Helpful assistant. Casual Malay/English. NEVER return JSON.";
  var originalInfo = "";
  if (context && context.originalTask) originalInfo = "\nOriginal request: " + context.originalTask;

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

  var text = "📊 *AURA Usage Report*\n";
  text += "━━━━━━━━━━━━━━━━━━━━\n";
  text += "📅 Date: " + report.lastReset + "\n";
  text += "📨 Requests: " + report.requestCount + "\n";
  text += "💰 Cost Today: $" + report.dailyTotal.toFixed(4) + "\n";
  text += "💳 Budget: $" + report.budget.toFixed(2) + "\n";
  text += "🟢 Remaining: $" + report.remaining.toFixed(4) + "\n";
  text += "━━━━━━━━━━━━━━━━━━━━\n";

  var breakdown = report.modelBreakdown;
  if (Object.keys(breakdown).length > 0) {
    text += "\n🤖 *Model Breakdown:*\n";
    for (var model in breakdown) {
      var shortName = model.split("/").length > 1 ? model.split("/")[1] : model;
      var pct = report.requestCount > 0 ? ((breakdown[model].count / report.requestCount) * 100).toFixed(0) : 0;
      text += "• " + shortName + ": " + breakdown[model].count + " (" + pct + "%) — $" + breakdown[model].cost.toFixed(4) + "\n";
    }
  }

  if (stats.credits && stats.credits.data) {
    text += "\n💎 *OpenRouter Credits:*\n";
    text += "• Balance: $" + (stats.credits.data.balance || 0).toFixed(4) + "\n";
  }

  return text;
}

// ============================================================
// CONTENT PIPELINE (kept)
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

    // Direct report command
    if (taskType === "report") {
      var reportText = await handleReport();
      return { response: reportText, result: reportText, duration: Date.now() - start, stepsExecuted: 1, totalSteps: 1, agents: ["system"] };
    }

    // pipeline command
    if (taskType === "content_pipeline") {
      var urlMatch = task.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        var pipeResult = await processContentPipeline(urlMatch[0]);
        if (pipeResult.success) {
          var pipeText = "📰 *Content Pipeline Complete*\n\n";
          if (pipeResult.platforms.fb && pipeResult.platforms.fb.success) pipeText += "📘 *Facebook:*\n" + pipeResult.platforms.fb.content + "\n\n";
          if (pipeResult.platforms.threads && pipeResult.platforms.threads.success) pipeText += "🧵 *Threads:*\n" + pipeResult.platforms.threads.content + "\n\n";
          if (pipeResult.platforms.x && pipeResult.platforms.x.success) pipeText += "𝕏 *X/Twitter:*\n" + pipeResult.platforms.x.content + "\n\n";
          pipeText += "\n🔗 Source: " + urlMatch[0];
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
    for (var p = 0; p < plan.length; p++) agentSet[plan[p].agent] = true;
    var agents = Object.keys(agentSet);

    console.log("PLAN: " + plan.length + " steps, agents: " + agents.join(", "));

    // STEP 4 - EXECUTION
    console.log("STEP 4: EXECUTION");
    var results = [];
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
        from: context.from || "Telegram"
      });

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

    // SAFETY: strip JSON if accidentally returned
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

// Alternative simpler entry point
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
