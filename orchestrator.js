// ============================================================
// AURA v4.1 — Orchestrator (The Brain)
// Image Attachment + Content Pipeline + Smart Image Routing
// ============================================================

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { chooseModel, MODELS, TASK_MODEL_MAP, COST_LIMITS } from "./tools/modelRouter.js";
import { chatCompletion, firecrawlSearch, openRouterAnalyzeImage, getCostReport, shouldUseFreeModel, getUsageStats } from "./tools/openRouter.js";
import {
  webSearch, research, generateImage, analyzeImage, writeContent, generateCaption,
  searchMemory, saveMemory, logActivity, callToolLLM,
  airtableCreate, airtableUpdate, airtableFindByFormula, airtableGet,
  sendTelegramImage, sendTelegramBase64Image
} from "./tools/index.js";

var OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function extractSmartTitle(caption, originalTask) {
  if (!caption) return (originalTask || "Untitled").substring(0, 80);
  var text = caption.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "").trim();
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\*\*/g, "").replace(/#\w+/g, "").trim();
    if (line.length > 10 && line.length < 100) return line.substring(0, 80);
  }
  return text.substring(0, 80).replace(/\n/g, " ");
}

function extractHashtags(caption) {
  if (!caption) return "";
  var matches = caption.match(/#[A-Za-z0-9_\u00C0-\u024F]+/g);
  if (!matches) return "";
  var unique = [], seen = {};
  for (var i = 0; i < matches.length; i++) {
    if (!seen[matches[i].toLowerCase()]) { seen[matches[i].toLowerCase()] = true; unique.push(matches[i]); }
  }
  return unique.join(" ");
}

// Extract image URL from text (LLM response or scraped content)
function extractImageUrl(text) {
  if (!text) return null;
  // Look for IMAGE_URL: prefix
  var prefixMatch = text.match(/IMAGE_URL:\s*(https?:\/\/[^\s"'<>]+)/i);
  if (prefixMatch) return prefixMatch[1];
  // Look for og:image or common image URLs
  var urlMatch = text.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/i);
  if (urlMatch) return urlMatch[1];
  return null;
}

var BOSS_PLAN_PROMPT =
  "You are AURA - Matrol personal AI assistant.\n\n" +
  "AVAILABLE TOOLS:\n" +
  "- webSearch, research, generateImage, analyzeImage, writeContent, generateCaption\n" +
  "- contentPipeline, airtableCreate, airtableUpdate, airtableFindByFormula\n\n" +
  "PLANNING RULES:\n" +
  "1. CASUAL (hi, hello) -> 1 step, casual reply, NO tools\n" +
  "2. CONTENT REQUEST (caption, draft, post + save/airtable) -> ALWAYS 3 steps:\n" +
  "   Step 1: use generateCaption or use writeContent\n" +
  "   Step 2: use generateImage (matching visual for the content)\n" +
  "   Step 3: use airtableCreate (save everything as Draft)\n" +
  "3. IMAGE ONLY (buat gambar, generate image - NO mention of airtable/draft/save) -> 1 step, use generateImage\n" +
  "4. RESEARCH -> ops agent, use webSearch\n" +
  "5. CODING -> coding agent, direct response\n" +
  "6. REPORT (/report) -> direct report\n" +
  "7. PIPELINE (/pipeline URL) -> use contentPipeline\n\n" +
  "CONTENT IMAGE RULES:\n" +
  "- Describe image based on content topic, specific and visual\n" +
  "- Example: daging salai -> 'delicious Malaysian smoked beef on wooden plate, rustic kampung style, warm lighting, food photography'\n\n" +
  "OUTPUT: Return ONLY valid JSON array. Max 4 steps.\n" +
  '[{"step":1,"agent":"content","action":"use generateCaption","params":{"topic":"..."},"description":"why","depends_on":null}]';

var BOSS_CHAT_PROMPT =
  "You are AURA CORE v4.1 - Matrol personal AI operating system.\n" +
  "Casual Malay/English. Default Malay.\n" +
  "NEVER return JSON. NEVER say you cannot access Airtable or generate images.\n" +
  "You CAN generate images, search web, save to Airtable - these are your tools.\n" +
  "Reply like a smart friend. Natural emoji.";

var AGENT_ROLES = {
  content:
    "You are AURA Content agent for Sakluma brand.\n" +
    "BRAND: Malaysian smoked meats. Tone: warm, authentic, kampung vibes.\n" +
    "Voice: friend sharing food secrets, NOT salesperson.\n" +
    "Facebook: 3-5 perenggan, 200-350 words, hook + story + CTA + hashtags.\n" +
    "Instagram: 80-150 words, aesthetic, 8-12 hashtags at END.\n" +
    "FORBIDDEN: cringe, fake enthusiasm, corporate tone.\n" +
    "NEVER return JSON. Default language: Malay.",
  ops: "AURA Ops agent. Casual Malay. NEVER return JSON.",
  coding: "AURA Coding agent. Debug, code gen, troubleshoot. NEVER return JSON.",
  finance: "AURA Finance agent. Pricing, ROI. NEVER return JSON.",
  sales: "AURA Sales agent. NEVER return JSON.",
  marketing: "AURA Marketing agent. NEVER return JSON.",
  training: "AURA Training agent. NEVER return JSON.",
  architect: "AURA Architect agent. NEVER return JSON."
};

export function detectTaskType(message) {
  var msg = (message || "").toLowerCase();
  if (msg.includes("/report") || msg.includes("/usage") || msg.includes("/cost")) return "report";
  if (msg.includes("/pipeline") || msg.includes("content pipeline")) return "content_pipeline";
  // Standalone image = mentions image but NOT caption/draft/airtable/save
  if ((msg.includes("generate image") || msg.includes("buat gambar") || msg.includes("/image")) && !msg.includes("caption") && !msg.includes("draft") && !msg.includes("save") && !msg.includes("airtable")) return "image";
  if (msg.includes("search") || msg.includes("cari") || msg.includes("trend") || msg.includes("berita") || msg.includes("/search")) return "research";
  if (msg.includes("code") || msg.includes("debug") || msg.includes("error") || msg.includes("bug") || msg.includes("/code")) return "coding";
  if (msg.includes("caption") || msg.includes("content") || msg.includes("tulis") || msg.includes("draft") || msg.includes("sakluma") || msg.includes("keelyn") || msg.includes("post") || msg.includes("copywriting")) return "content";
  if (msg.includes("finance") || msg.includes("kewangan") || msg.includes("kira") || msg.includes("budget") || msg.includes("pricing")) return "finance";
  if (msg.length < 50) return "simple_chat";
  return "simple_chat";
}

export function selectModel(taskType, attempt) {
  if (!attempt) attempt = 0;
  if (shouldUseFreeModel() && taskType !== "image") return "google/gemini-2.5-flash";
  var list = TASK_MODEL_MAP[taskType] || TASK_MODEL_MAP["default"];
  if (attempt < list.length) return list[attempt];
  return "openrouter/auto";
}

async function callLLM(systemPrompt, userMessage, taskType) {
  if (!taskType) taskType = "general";
  var selected = chooseModel(taskType);
  console.log("\n=================================");
  console.log("MODEL ROUTER | " + selected.model + " | " + selected.reason);
  console.log("=================================");
  var result = await chatCompletion({ model: selected.model, messages: [{ role: "user", content: userMessage }], systemPrompt: systemPrompt, temperature: 0.7, maxTokens: 1500 });
  if (result.success) { console.log("MODEL RESPONSE SUCCESS"); return result.content; }
  if (result.suggestFallback || result.error === "RATE_LIMIT") {
    var fb = await chatCompletion({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: userMessage }], systemPrompt: systemPrompt, temperature: 0.7, maxTokens: 1500 });
    if (fb.success) return fb.content;
  }
  console.error("LLM FAILED: " + result.error);
  return "Eh sorry, technical issue jap. Cuba lagi!";
}

function isCasualMessage(text) {
  var casual = ["hi","hello","hey","yo","hai","ok","okay","noted","thanks","tq","ty","bye","test","testing","apa khabar","good morning","morning","haha","lol","nice","cool","best","gempak","ya","yes","no","tak","nope"];
  var lower = (text || "").toLowerCase().trim();
  for (var i = 0; i < casual.length; i++) if (lower === casual[i]) return true;
  if (lower.length < 15) { for (var j = 0; j < casual.length; j++) if (lower.indexOf(casual[j]) === 0) return true; }
  return false;
}

// ============================================================
// TOOL EXECUTION ENGINE
// ============================================================
async function executeWithTools(agentName, action, params, context) {
  var a = (action || "").toLowerCase();
  console.log("\n--- AGENT: " + agentName + " | ACTION: " + action + " ---");

  // IMAGE ANALYSIS
  if (a.includes("use analyzeimage") || a.includes("analyze image") || a.includes("analisis gambar")) {
    var imageInput = (context && context.imageBase64) || params.imageUrl || params.url || "";
    var question = params.question || (context && context.originalTask) || "Analyze this image.";
    var vr = await openRouterAnalyzeImage(imageInput, question);
    if (vr.success) return vr.content;
    return await analyzeImage(imageInput, question);
  }

  // WEB SEARCH
  if (a.includes("use websearch") || a.includes("search internet") || a.includes("cari info")) {
    var q = params.query || params.topic || (context && context.originalTask) || action;
    console.log("[Engine] webSearch: " + q);
    var sr = await firecrawlSearch(q, { depth: "high", maxResults: 5 });
    if (sr.success) return "Search Results:\n" + sr.content;
    var r = await webSearch(q);
    return "Search Results:\n" + ((r && r.answer) || "No results");
  }

  // RESEARCH
  if (a.includes("use research") || a.includes("deep analysis")) {
    return await research(params.topic || (context && context.originalTask) || action);
  }

  // ============================================================
  // IMAGE GENERATION — returns marker, does NOT send anywhere yet
  // Orchestrator decides: Telegram or Airtable based on task type
  // ============================================================
  if (a.includes("use generateimage") || a.includes("buat gambar") || a.includes("create image") || a.includes("generate image")) {
    var imgPrompt = params.prompt || params.description || action.replace(/use generateimage:?\s*/i, "");
    if (imgPrompt.length < 20 && context && context.originalTask) {
      imgPrompt = "Food photography of " + context.originalTask.substring(0, 100) + ", Malaysian style, warm lighting, appetizing";
    }
    console.log("IMAGE GENERATION: " + imgPrompt);
    var imgUrl = await generateImage(imgPrompt, { width: 1024, height: 1024 });
    if (imgUrl) {
      // Return marker — orchestrator will route to Telegram or Airtable
      return "IMAGE_URL:" + imgUrl;
    }
    return "Gambar tak berjaya. Cuba lagi?";
  }

  // WRITE CONTENT
  if (a.includes("use writecontent") || a.includes("tulis artikel") || a === "writecontent") {
    return await writeContent(params.brief || (context && context.originalTask) || action, params.style || "casual", params.platform || "general");
  }

  // CAPTION
  if (a.includes("use generatecaption") || a.includes("buat caption") || a === "generatecaption") {
    return await generateCaption(params.topic || (context && context.originalTask) || action, params.platform || "facebook", params.mood || "engaging");
  }

  // CONTENT PIPELINE
  if (a.includes("use contentpipeline") || a.includes("content pipeline")) {
    var pipeUrl = params.url || action.match(/https?:\/\/[^\s]+/);
    if (pipeUrl) {
      if (typeof pipeUrl !== "string") pipeUrl = pipeUrl[0];
      var pipeResult = await processContentPipeline(pipeUrl);
      if (pipeResult.success) {
        var pt = "Content Pipeline Complete!\n\n";
        if (pipeResult.articleImage) pt += "Main Image: " + pipeResult.articleImage + "\n\n";
        if (pipeResult.platforms.fb && pipeResult.platforms.fb.success) pt += "=== FB ===\n" + pipeResult.platforms.fb.content + "\n\n";
        if (pipeResult.platforms.threads && pipeResult.platforms.threads.success) pt += "=== THREADS ===\n" + pipeResult.platforms.threads.content + "\n\n";
        if (pipeResult.platforms.x && pipeResult.platforms.x.success) pt += "=== X ===\n" + pipeResult.platforms.x.content + "\n\n";
        return pt;
      }
      return "Pipeline gagal: " + pipeResult.error;
    }
    return "Sila bagi URL.";
  }

  // ============================================================
  // AIRTABLE CREATE — with "Image file" attachment support
  // ============================================================
  if (a.includes("use airtablecreate") || a.includes("save to airtable") || a.includes("airtable create") || a === "airtablecreate") {
    console.log("[Engine] airtableCreate");

    // Get caption from previous steps
    var captionValue = params.caption || params.Caption || "";
    if (!captionValue && context && context.captionFromStep1) captionValue = context.captionFromStep1;
    if (!captionValue && context && context.lastResult && typeof context.lastResult === "string" && context.lastResult.length > 50 && !context.lastResult.startsWith("IMAGE_URL:") && !context.lastResult.startsWith("Gambar")) captionValue = context.lastResult;

    // Get image URL (HTTP only — from AI gen or article scrape)
    var imageUrlValue = "";
    // From AI generated image (only if HTTP)
    if (context && context.imageHttpUrl) imageUrlValue = context.imageHttpUrl;
    // From article scrape
    if (!imageUrlValue && context && context.articleImage) imageUrlValue = context.articleImage;
    // From params
    if (!imageUrlValue) imageUrlValue = params.imageUrl || params["Image URL"] || "";
    // Safety: only HTTP
    if (imageUrlValue && !imageUrlValue.startsWith("http")) imageUrlValue = "";

    var titleValue = extractSmartTitle(captionValue, context && context.originalTask);
    var hashtagsValue = extractHashtags(captionValue);

    var platformValue = "Facebook";
    var taskLower = (context && context.originalTask || "").toLowerCase();
    if (taskLower.includes("instagram") || taskLower.includes("ig")) platformValue = "Instagram";
    else if (taskLower.includes("thread")) platformValue = "Threads";
    else if (taskLower.includes("twitter")) platformValue = "Twitter";

    var fields = {
      "Title": titleValue,
      "Caption": captionValue || "",
      "Image URL": imageUrlValue,
      "Platform": platformValue,
      "Status": "Draft",
      "Created By": (context && context.from) || "AURA",
      "Content Type": (context && context.imageGenerated) || imageUrlValue ? "Image" : "Post",
      "AI Caption": captionValue || "",
      "AI Hashtags": hashtagsValue,
      "AI Content Insights": "Platform: " + platformValue + " | AURA Content Agent" + (imageUrlValue ? " | Image attached" : (context && context.imageGenerated) ? " | Image generated (base64, pending upload)" : ""),
      "Hashtags": hashtagsValue,
      "Brand": "Sakluma"
    };

    // ✅ "Image file" attachment field — only if HTTP URL exists
    if (imageUrlValue) {
      fields["Image file"] = [{ url: imageUrlValue }];
    }

    // Clean empty fields
    var cleaned = {};
    for (var fk in fields) {
      if (fields[fk] !== null && fields[fk] !== undefined && fields[fk] !== "") {
        cleaned[fk] = fields[fk];
      }
    }

    try {
      var rec = await airtableCreate(cleaned);
      var resp = "\u2705 Saved to Airtable (Draft)\nRecord ID: " + rec.id + "\nTitle: " + titleValue;
      if (hashtagsValue) resp += "\nHashtags: " + hashtagsValue;
      if (imageUrlValue) resp += "\nImage: attached to Airtable";
      else if (context && context.imageGenerated) resp += "\nImage: generated (base64 — upload ke GDrive needed for attachment)";
      return resp;
    } catch (err) {
      console.error("[AirtableCreate] Failed:", err.message);
      return "\u274C Airtable save failed: " + err.message;
    }
  }

  // AIRTABLE UPDATE
  if (a.includes("use airtableupdate") || a.includes("airtable update")) {
    var recordId = params.recordId || params.id;
    if (!recordId) return "\u274C perlukan recordId.";
    try { var upd = await airtableUpdate(recordId, params.fields || {}); return "\u2705 Updated: " + upd.id; }
    catch (e) { return "\u274C Update failed: " + e.message; }
  }

  // AIRTABLE FIND
  if (a.includes("use airtablefindbyformula") || a.includes("find latest draft")) {
    try {
      var res = await airtableFindByFormula('{Status}="Draft"', { maxRecords: 1 });
      if (!res.records || !res.records.length) return "\u274C Tak jumpa Draft.";
      return "\u2705 Draft: " + res.records[0].id;
    } catch (e) { return "\u274C Find failed: " + e.message; }
  }

  // LLM FALLBACK
  console.log("[Engine] LLM fallback");
  var role = AGENT_ROLES[agentName] || "Helpful assistant. Casual Malay. NEVER return JSON.";
  return await callLLM(role, "TASK: " + action + (context && context.originalTask ? "\nOriginal: " + context.originalTask : "") + "\nReply casual Malay. No JSON.", action);
}

async function planTask(understanding, memories, task) {
  if (isCasualMessage(task)) return [{ step: 1, agent: "content", action: "casual reply to: " + task, params: {}, description: "Chat", depends_on: null }];
  var mem = "";
  if (memories && memories.length > 0) mem = "\nMEMORIES:\n" + memories.slice(0, 3).map(function(m) { return "- " + m.task; }).join("\n");
  var pr = await callLLM(BOSS_PLAN_PROMPT, "Plan. Return ONLY JSON array.\nREQUEST: " + task + "\nUNDERSTANDING: " + understanding + mem, task);
  try {
    var match = pr.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]).slice(0, 4);
    return JSON.parse(pr).slice(0, 4);
  } catch (e) {
    return [{ step: 1, agent: "content", action: "respond to: " + task, params: {}, description: "Direct", depends_on: null }];
  }
}

async function bossApprove(step) {
  var d = await callLLM(BOSS_CHAT_PROMPT, "Reply PROCEED or SKIP.\nSTEP: " + JSON.stringify(step), "approve");
  console.log("Boss: " + d.substring(0, 60));
  return d.toUpperCase().indexOf("SKIP") !== 0;
}

async function bossReview(task, results) {
  var txt = results.map(function(r) { return "[" + r.agent + "]: " + (r.result || "").substring(0, 500); }).join("\n\n");
  return await callLLM(BOSS_CHAT_PROMPT, "Write final response for Matrol.\nRequest: " + task + "\n\nResults:\n" + txt + "\n\nCasual Malay. No JSON.", task);
}

async function handleReport() {
  var report = getCostReport();
  return "\uD83D\uDCCA *AURA Report*\nRequests: " + report.requestCount + "\nCost: $" + report.dailyTotal.toFixed(4) + "\nBudget: $" + report.budget.toFixed(2) + "\nRemaining: $" + report.remaining.toFixed(4);
}

// ============================================================
// CONTENT PIPELINE — Now extracts main image from article
// ============================================================
export async function processContentPipeline(url, options) {
  if (!options) options = {};
  var brand = options.brand || "Sakluma";
  var platforms = options.platforms || ["fb", "threads", "x"];

  console.log("[Pipeline] Scraping: " + url);

  // Step 1: Scrape article AND extract main image
  var scrape = await firecrawlSearch(
    "Read this article: " + url + "\n\n" +
    "Return TWO things:\n" +
    "1. The main/featured image URL of the article (og:image or first prominent image). Write it as: IMAGE_URL: https://...\n" +
    "2. A comprehensive summary of the article content.\n\n" +
    "Format your response as:\n" +
    "IMAGE_URL: [url here]\n" +
    "CONTENT: [full article summary here]",
    { model: "google/gemini-2.5-flash", depth: "high", maxResults: 1, maxTokens: 4096 }
  );

  if (!scrape.success) return { success: false, error: scrape.error };

  var fullResponse = scrape.content || "";

  // Extract main image URL
  var articleImage = extractImageUrl(fullResponse);
  if (articleImage) {
    console.log("[Pipeline] Main image found: " + articleImage.substring(0, 80));
  } else {
    console.log("[Pipeline] No main image found in article");
  }

  // Extract content (remove IMAGE_URL line)
  var articleContent = fullResponse
    .replace(/IMAGE_URL:\s*https?:\/\/[^\s\n]+/i, "")
    .replace(/^CONTENT:\s*/im, "")
    .trim();

  // Step 2: Generate content for each platform
  var results = {};
  var fmts = {
    fb: "Facebook post, storytelling, 3-5 paragraphs, hook + CTA. Bahasa Malaysia casual.",
    threads: "Threads, max 500 chars, punchy hot take. Bahasa Malaysia.",
    x: "X/Twitter, max 280 chars, 2-3 hashtags. Bahasa Malaysia.",
    ig: "Instagram caption, aesthetic, 8-12 hashtags at END. Bahasa Malaysia."
  };

  for (var p = 0; p < platforms.length; p++) {
    var cr = await chatCompletion({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: "Create a " + (fmts[platforms[p]] || fmts.fb) + "\nBrand: " + brand + "\nArticle:\n" + articleContent }],
      systemPrompt: "Social media expert for " + brand + ". Bahasa Malaysia.",
      maxTokens: 2048,
      temperature: 0.85
    });
    results[platforms[p]] = { success: cr.success, content: cr.content, model: cr.model };
  }

  // Step 3: Auto-save to Airtable with image
  var bestCaption = "";
  if (results.fb && results.fb.success) bestCaption = results.fb.content;
  else if (results.ig && results.ig.success) bestCaption = results.ig.content;

  if (bestCaption) {
    var titleValue = extractSmartTitle(bestCaption, url);
    var hashtagsValue = extractHashtags(bestCaption);

    var airtableFields = {
      "Title": titleValue,
      "Caption": bestCaption,
      "Platform": "Facebook",
      "Status": "Draft",
      "Created By": "AURA Pipeline",
      "Content Type": articleImage ? "Image" : "Post",
      "AI Caption": bestCaption,
      "AI Hashtags": hashtagsValue,
      "AI Content Insights": "Source: " + url + " | Pipeline auto-generated",
      "Hashtags": hashtagsValue,
      "Brand": brand
    };

    // ✅ Attach article image if found
    if (articleImage) {
      airtableFields["Image URL"] = articleImage;
      airtableFields["Image file"] = [{ url: articleImage }];
    }

    // Clean empty
    var cleaned = {};
    for (var fk in airtableFields) {
      if (airtableFields[fk] !== null && airtableFields[fk] !== undefined && airtableFields[fk] !== "") {
        cleaned[fk] = airtableFields[fk];
      }
    }

    try {
      var rec = await airtableCreate(cleaned);
      console.log("[Pipeline] Saved to Airtable: " + rec.id);
    } catch (err) {
      console.error("[Pipeline] Airtable save failed: " + err.message);
    }
  }

  return {
    success: true,
    articleImage: articleImage,
    platforms: results
  };
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================
export async function runOrchestrator(task, context) {
  if (!context) context = {};
  var start = Date.now();
  console.log("\n=================================");
  console.log("AURA v4.1.0 | " + task.substring(0, 80));
  console.log("=================================");

  try {
    var taskType = detectTaskType(task);
    if (taskType === "report") { var rt = await handleReport(); return { response: rt, result: rt }; }

    if (taskType === "content_pipeline") {
      var urlMatch = task.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        var pr = await processContentPipeline(urlMatch[0]);
        if (pr.success) {
          var pt = "\uD83D\uDCF0 *Pipeline Complete*\n\n";
          if (pr.articleImage) pt += "\uD83D\uDDBC Image: Attached to Airtable\n\n";
          if (pr.platforms.fb && pr.platforms.fb.success) pt += "*FB:*\n" + pr.platforms.fb.content + "\n\n";
          if (pr.platforms.threads && pr.platforms.threads.success) pt += "*Threads:*\n" + pr.platforms.threads.content + "\n\n";
          if (pr.platforms.x && pr.platforms.x.success) pt += "*X:*\n" + pr.platforms.x.content + "\n\n";
          pt += "\u2705 Auto-saved to Airtable as Draft";
          return { response: pt, result: pt };
        }
      }
      return { response: "Sila bagi URL.", error: true };
    }

    console.log("STEP 1: UNDERSTANDING");
    var understanding = isCasualMessage(task) ? "Casual chat." : await callLLM(BOSS_CHAT_PROMPT, "Ringkaskan apa user nak (1 ayat).\nMessage: " + task, task);

    console.log("STEP 2: MEMORY");
    var memories = await searchMemory(task);

    console.log("STEP 3: PLANNING");
    var plan = await planTask(understanding, memories, task);
    var agentSet = {};
    for (var pp = 0; pp < plan.length; pp++) agentSet[plan[pp].agent] = true;
    console.log("PLAN: " + plan.length + " steps");

    // ============================================================
    // STEP 4: EXECUTION — Smart image routing
    // ============================================================
    console.log("STEP 4: EXECUTION");
    var results = [];
    var lastResult = null;
    var captionFromStep1 = null;
    var imageGenerated = false;
    var imageHttpUrl = null;   // HTTP URL (can go to Airtable)
    var imageRawUrl = null;    // Full URL/base64 (for Telegram if standalone)

    for (var s = 0; s < plan.length; s++) {
      var step = plan[s];
      console.log("[" + step.agent.toUpperCase() + "] " + step.action);

      var approved = true;
      if (plan.length > 1) approved = await bossApprove(step);
      if (!approved) { console.log("SKIPPED"); continue; }

      try {
        var result = await executeWithTools(step.agent, step.action, step.params || {}, {
          imageBase64: context.imageBase64 || null,
          originalTask: task,
          understanding: understanding,
          from: context.from || "Telegram",
          chatId: context.chatId || null,
          lastResult: lastResult,
          captionFromStep1: captionFromStep1,
          imageHttpUrl: imageHttpUrl,
          imageGenerated: imageGenerated
        });

        // Track cross-step data
        if (result && typeof result === "string") {
          if (result.startsWith("IMAGE_URL:")) {
            imageGenerated = true;
            imageRawUrl = result.replace("IMAGE_URL:", "");
            if (imageRawUrl.startsWith("http")) {
              imageHttpUrl = imageRawUrl;
            }
            // Short summary for results (NOT the actual image data)
            result = "Image generated successfully.";
          } else if (!captionFromStep1 && result.length > 50) {
            captionFromStep1 = result;
          }
        }

        lastResult = result;
        results.push({ step: step.step, agent: step.agent, action: step.action, result: result });
        console.log("[" + step.agent + "] COMPLETE");

      } catch (stepErr) {
        console.error("[STEP " + step.step + " FAILED] " + stepErr.message);
        results.push({ step: step.step, agent: step.agent, action: step.action, result: "Step failed: " + stepErr.message });
      }
    }

    console.log("EXECUTED: " + results.length + "/" + plan.length);

    // ============================================================
    // IMAGE ROUTING DECISION
    // ============================================================
    if (imageGenerated && imageRawUrl) {
      // Check: is this a standalone image request (no airtable/content)?
      var isStandaloneImage = (taskType === "image");

      if (isStandaloneImage) {
        // ✅ Standalone image → Send to Telegram
        console.log("[Image Routing] Standalone → Telegram");
        try {
          if (imageRawUrl.startsWith("data:image")) {
            await sendTelegramBase64Image(imageRawUrl, "\uD83C\uDFA8 Gambar generated by AURA", { chatId: context.chatId });
          } else if (imageRawUrl.startsWith("http")) {
            await sendTelegramImage(imageRawUrl, "\uD83C\uDFA8 Gambar generated by AURA", { chatId: context.chatId });
          }
          console.log("[Image] Sent to Telegram");
        } catch (imgErr) {
          console.error("[Image] Telegram send failed: " + imgErr.message);
        }
      } else {
        // ✅ Content flow → Image goes to Airtable only (already handled in airtableCreate)
        console.log("[Image Routing] Content flow → Airtable (handled in airtableCreate step)");
      }
    }

    // STEP 5: REVIEW
    console.log("STEP 5: REVIEW");
    var finalResponse;
    if (results.length === 0) finalResponse = "Tak dapat proses. Cuba lagi.";
    else if (results.length === 1) finalResponse = results[0].result;
    else finalResponse = await bossReview(task, results);

    var trimmed = (finalResponse || "").trim();
    if (trimmed.indexOf("[{") === 0 || trimmed.indexOf("```") === 0) {
      finalResponse = await callLLM(BOSS_CHAT_PROMPT, "Rewrite as casual Malay reply. No JSON.\n\n" + finalResponse, task);
    }

    // STEP 6: MEMORY
    console.log("STEP 6: MEMORY");
    await saveMemory(task, finalResponse);
    await logActivity("orchestrator", task, finalResponse, "success");

    console.log("AURA COMPLETE - " + (Date.now() - start) + "ms");
    return { response: finalResponse, result: finalResponse, duration: Date.now() - start, stepsExecuted: results.length, totalSteps: plan.length, agents: Object.keys(agentSet) };

  } catch (error) {
    console.error("ORCHESTRATOR FAILED: " + (error.message || error));
    return { response: "Aduhh ada issue technical. Cuba lagi jap.", error: true };
  }
}

export async function processMessage(userMessage, context) {
  return await runOrchestrator(userMessage, context);
}

export default { runOrchestrator, processMessage, detectTaskType, selectModel, processContentPipeline };
