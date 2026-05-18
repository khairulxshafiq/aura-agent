// ============================================================
// AURA v4.1 — Orchestrator (The Brain)
// FULL MERGE: Content Style + Memory + GDrive + Cost + All Fixes
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
  sendTelegramImage, sendTelegramBase64Image,
  uploadImageToGDrive, downloadAndUploadToGDrive,
  saveConversation, getConversationHistory, getPreferences, savePreference, detectFeedback, buildContext
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

function extractImageUrl(text) {
  if (!text) return null;
  var prefixMatch = text.match(/IMAGE_URL:\s*(https?:\/\/[^\s"'<>]+)/i);
  if (prefixMatch) return prefixMatch[1];
  var urlMatch = text.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/i);
  if (urlMatch) return urlMatch[1];
  return null;
}

function getMaxTokens(taskType) {
  var limits = { simple_chat: 500, content: 1500, coding: 3000, research: 2000, finance: 1500, image: 500, report: 500 };
  return limits[taskType] || 1500;
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
  "   Step 2: use generateImage (matching visual)\n" +
  "   Step 3: use airtableCreate (save as Draft)\n" +
  "3. IMAGE ONLY (buat gambar - NO mention of airtable/draft/save) -> 1 step, use generateImage\n" +
  "4. RESEARCH -> ops agent, use webSearch\n" +
  "5. CODING -> coding agent, direct response\n" +
  "6. REPORT (/report) -> direct report\n" +
  "7. PIPELINE (/pipeline URL) -> use contentPipeline\n\n" +
  "OUTPUT: Return ONLY valid JSON array. Max 4 steps.\n" +
  '[{"step":1,"agent":"content","action":"use generateCaption","params":{"topic":"..."},"description":"why","depends_on":null}]';

var BOSS_CHAT_PROMPT =
  "You are AURA CORE v4.1 - Matrol personal AI operating system.\n" +
  "Casual Malay/English. Default Malay.\n" +
  "NEVER return JSON. NEVER say you cannot access tools.\n" +
  "You CAN generate images, search web, save to Airtable.\n" +
  "Reply like a smart friend. Natural emoji (max 2).\n" +
  "ALWAYS remember context from conversation history provided.";

var AGENT_ROLES = {
  content:
    "You are AURA Content agent.\n\n" +
    "WRITING STYLE (IKUT NI EXACTLY):\n" +
    "- Tulis macam Malaysian content creator, BUKAN macam AI\n" +
    "- SHORT paragraphs. 1-2 ayat per paragraph MAX.\n" +
    "- Line break antara setiap paragraph\n" +
    "- JANGAN guna bullet points atau numbered lists dalam social posts\n" +
    "- JANGAN start dengan 'Eh korang' atau 'Hai guys' atau 'Hey geng'\n" +
    "- JANGAN guna lebih 2 emoji dalam satu post\n" +
    "- JANGAN tulis 'Share dan tag kawan' atau mana-mana CTA paksa\n" +
    "- JANGAN guna tanda lama (em dash) macam ni: --\n" +
    "- Tone: macam kawan cerita kat mamak. Santai tapi ada isi.\n" +
    "- Ada PENDIRIAN. Bukan neutral boring.\n" +
    "- Boleh provocative sikit. Buat orang nak respond.\n" +
    "- End dengan statement yang buat orang fikir.\n\n" +
    "PLATFORM FORMAT:\n" +
    "- Facebook: 5-8 short paragraphs. Hook first line (bold/tegas). Story middle. Punchline end. Max 2 hashtags.\n" +
    "- Instagram: 3-5 short paragraphs. Aesthetic minimal. 5-8 hashtags at END only.\n" +
    "- Threads: Bebenang style. Each post max 500 chars. Numbered if series.\n" +
    "- X/Twitter: 1-2 ayat sharp. Max 280 chars. 1-2 hashtags.\n\n" +
    "STYLE REFERENCE:\n" +
    "- MFS style: Direct, tegas, fakta + pendapat. Short lines.\n" +
    "- Abe Nazz style: Storytelling, personal experience.\n" +
    "- Thread style: Numbered points, short punchy facts.\n\n" +
    "FORBIDDEN: Generic AI opening, excessive emojis, forced CTA, corporate tone, bullet points, em dash (--)\n\n" +
    "BRAND (Sakluma): Malaysian smoked meats. Kampung authentic.\n" +
    "Voice: macam pakcik yang tahu rahsia masakan. Humble tapi confident.\n" +
    "ONLY mention Sakluma if asked.\n\n" +
    "CASUAL CHAT: Reply macam kawan. Pendek. Warm.\n" +
    "NEVER return JSON. Default: Bahasa Malaysia (casual).",
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
  if ((msg.includes("generate image") || msg.includes("buat gambar") || msg.includes("/image") || msg.includes("generateimage")) && !msg.includes("caption") && !msg.includes("draft") && !msg.includes("save") && !msg.includes("airtable")) return "image";
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

async function callLLM(systemPrompt, userMessage, taskType, history) {
  if (!taskType) taskType = "general";
  var selected = chooseModel(taskType);
  var maxTokens = getMaxTokens(taskType);
  console.log("\n=== MODEL: " + selected.model + " | Tokens: " + maxTokens + " ===");
  var messages = [];
  if (history && history.length > 0) messages = history.slice(-5);
  messages.push({ role: "user", content: userMessage });
  var result = await chatCompletion({ model: selected.model, messages: messages, systemPrompt: systemPrompt, temperature: 0.7, maxTokens: maxTokens });
  if (result.success) return result.content;
  if (result.suggestFallback || result.error === "RATE_LIMIT") {
    var fb = await chatCompletion({ model: "google/gemini-2.5-flash", messages: messages, systemPrompt: systemPrompt, temperature: 0.7, maxTokens: maxTokens });
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

  if (a.includes("use analyzeimage") || a.includes("analyze image") || a.includes("analyzeimage") || a.includes("analisis gambar")) {
    var imageInput = (context && context.imageBase64) || params.imageUrl || params.url || "";
    var question = params.question || (context && context.originalTask) || "Analyze this image.";
    var vr = await openRouterAnalyzeImage(imageInput, question);
    if (vr.success) return vr.content;
    return await analyzeImage(imageInput, question);
  }

  if (a.includes("use websearch") || a.includes("websearch") || a.includes("search internet") || a.includes("cari info")) {
    var q = params.query || params.topic || (context && context.originalTask) || action;
    console.log("[Engine] webSearch: " + q);
    var sr = await firecrawlSearch(q, { depth: "high", maxResults: 5 });
    if (sr.success) return "Search Results:\n" + sr.content;
    var r = await webSearch(q);
    return "Search Results:\n" + ((r && r.answer) || "No results");
  }

  if (a.includes("use research") || a.includes("deep analysis")) {
    return await research(params.topic || (context && context.originalTask) || action);
  }

  if (a.includes("use generateimage") || a.includes("generateimage") || a.includes("buat gambar") || a.includes("create image") || a.includes("generate image")) {
    var imgPrompt = params.prompt || params.description || action.replace(/use generateimage:?\s*/i, "").replace(/generateimage:?\s*/i, "");
    if (imgPrompt.length < 20 && context && context.originalTask) {
      imgPrompt = "Food photography of " + context.originalTask.substring(0, 100) + ", Malaysian style, warm lighting, appetizing";
    }
    console.log("IMAGE GENERATION: " + imgPrompt);
    var imgUrl = await generateImage(imgPrompt, { width: 1024, height: 1024 });
    if (imgUrl) {
      if (imgUrl.startsWith("data:image")) {
        console.log("[Image] Base64 detected, uploading to GDrive...");
        try {
          var gdResult = await uploadImageToGDrive(imgUrl, "aura_" + Date.now() + ".png");
          if (gdResult.success) {
            console.log("[Image] GDrive success: " + gdResult.url);
            return "IMAGE_URL:" + gdResult.url;
          }
        } catch (gdErr) {
          console.error("[Image] GDrive failed: " + gdErr.message);
        }
        return "IMAGE_BASE64:" + imgUrl;
      }
      return "IMAGE_URL:" + imgUrl;
    }
    return "Gambar tak berjaya. Cuba lagi?";
  }

  if (a.includes("use writecontent") || a.includes("writecontent") || a.includes("tulis artikel")) {
    return await writeContent(params.brief || (context && context.originalTask) || action, params.style || "casual", params.platform || "general");
  }

  if (a.includes("use generatecaption") || a.includes("generatecaption") || a.includes("buat caption")) {
    return await generateCaption(params.topic || (context && context.originalTask) || action, params.platform || "facebook", params.mood || "engaging");
  }

  if (a.includes("use contentpipeline") || a.includes("contentpipeline") || a.includes("content pipeline")) {
    var pipeUrl = params.url || action.match(/https?:\/\/[^\s]+/);
    if (pipeUrl) {
      if (typeof pipeUrl !== "string") pipeUrl = pipeUrl[0];
      var pipeResult = await processContentPipeline(pipeUrl);
      if (pipeResult.success) {
        var pt = "Content Pipeline Complete!\n\n";
        if (pipeResult.articleImage) pt += "Image: " + pipeResult.articleImage + "\n\n";
        if (pipeResult.platforms.fb && pipeResult.platforms.fb.success) pt += "=== FB ===\n" + pipeResult.platforms.fb.content + "\n\n";
        if (pipeResult.platforms.threads && pipeResult.platforms.threads.success) pt += "=== THREADS ===\n" + pipeResult.platforms.threads.content + "\n\n";
        if (pipeResult.platforms.x && pipeResult.platforms.x.success) pt += "=== X ===\n" + pipeResult.platforms.x.content + "\n\n";
        return pt;
      }
      return "Pipeline gagal: " + pipeResult.error;
    }
    return "Sila bagi URL.";
  }

  if (a.includes("use airtablecreate") || a.includes("airtablecreate") || a.includes("save to airtable") || a.includes("airtable create")) {
    console.log("[Engine] airtableCreate");
    var captionValue = params.caption || params.Caption || "";
    if (!captionValue && context && context.captionFromStep1) captionValue = context.captionFromStep1;
    if (!captionValue && context && context.lastResult && typeof context.lastResult === "string" && context.lastResult.length > 50 && !context.lastResult.startsWith("IMAGE_") && !context.lastResult.startsWith("Gambar")) captionValue = context.lastResult;

    var imageUrlValue = (context && context.imageHttpUrl) || "";
    if (!imageUrlValue && context && context.articleImage) imageUrlValue = context.articleImage;
    if (!imageUrlValue) imageUrlValue = params.imageUrl || params["Image URL"] || "";
    if (imageUrlValue && !imageUrlValue.startsWith("http")) imageUrlValue = "";

    var titleValue = extractSmartTitle(captionValue, context && context.originalTask);
    var hashtagsValue = extractHashtags(captionValue);

    var platformValue = "Facebook";
    var taskLower = (context && context.originalTask || "").toLowerCase();
    if (taskLower.includes("instagram") || taskLower.includes("ig")) platformValue = "Instagram";
    else if (taskLower.includes("thread")) platformValue = "Threads";
    else if (taskLower.includes("twitter")) platformValue = "Twitter";

    var fields = {
      "Title": titleValue, "Caption": captionValue || "",
      "Image URL": imageUrlValue, "Platform": platformValue, "Status": "Draft",
      "Created By": (context && context.from) || "AURA",
      "Content Type": imageUrlValue ? "Image" : "Post",
      "AI Caption": captionValue || "", "AI Hashtags": hashtagsValue,
      "AI Content Insights": "Platform: " + platformValue + " | AURA",
      "Hashtags": hashtagsValue, "Brand": "Sakluma"
    };
    if (imageUrlValue) fields["Image file"] = [{ url: imageUrlValue }];

    var cleaned = {};
    for (var fk in fields) { if (fields[fk] !== null && fields[fk] !== undefined && fields[fk] !== "") cleaned[fk] = fields[fk]; }

    try {
      var rec = await airtableCreate(cleaned);
      var resp = "\u2705 Saved to Airtable (Draft)\nRecord ID: " + rec.id + "\nTitle: " + titleValue;
      if (hashtagsValue) resp += "\nHashtags: " + hashtagsValue;
      if (imageUrlValue) resp += "\nImage: attached";
      return resp;
    } catch (err) {
      console.error("[AirtableCreate] Failed:", err.message);
      return "\u274C Airtable save failed: " + err.message;
    }
  }

  if (a.includes("use airtableupdate") || a.includes("airtableupdate") || a.includes("airtable update")) {
    var recordId = params.recordId || params.id;
    if (!recordId) return "\u274C perlukan recordId.";
    try { var upd = await airtableUpdate(recordId, params.fields || {}); return "\u2705 Updated: " + upd.id; }
    catch (e) { return "\u274C Update failed: " + e.message; }
  }

  if (a.includes("use airtablefindbyformula") || a.includes("airtablefindbyformula") || a.includes("find latest draft")) {
    try {
      var res = await airtableFindByFormula('{Status}="Draft"', { maxRecords: 1 });
      if (!res.records || !res.records.length) return "\u274C Tak jumpa Draft.";
      return "\u2705 Draft: " + res.records[0].id;
    } catch (e) { return "\u274C Find failed: " + e.message; }
  }

  console.log("[Engine] LLM fallback");
  var role = AGENT_ROLES[agentName] || "Helpful assistant. Casual Malay. NEVER return JSON.";
  return await callLLM(role, "TASK: " + action + (context && context.originalTask ? "\nOriginal: " + context.originalTask : "") + "\nReply casual Malay. No JSON.", action, context && context.history);
}

// ============================================================
// PLANNER + BOSS
// ============================================================

async function planTask(understanding, memories, task, history) {
  if (isCasualMessage(task)) return [{ step: 1, agent: "content", action: "casual reply to: " + task, params: {}, description: "Chat", depends_on: null }];
  var mem = "";
  if (memories && memories.length > 0) mem = "\nMEMORIES:\n" + memories.slice(0, 3).map(function(m) { return "- " + m.task; }).join("\n");
  var pr = await callLLM(BOSS_PLAN_PROMPT, "Plan. Return ONLY JSON array.\nREQUEST: " + task + "\nUNDERSTANDING: " + understanding + mem, task, history);
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

async function bossReview(task, results, history) {
  var txt = results.map(function(r) { return "[" + r.agent + "]: " + (r.result || "").substring(0, 500); }).join("\n\n");
  return await callLLM(BOSS_CHAT_PROMPT, "Write final response for Matrol.\nRequest: " + task + "\n\nResults:\n" + txt + "\n\nCasual Malay. No JSON.", task, history);
}

async function handleReport() {
  var report = getCostReport();
  return "\uD83D\uDCCA *AURA Report*\nRequests: " + report.requestCount + "\nCost: $" + report.dailyTotal.toFixed(4) + "\nBudget: $" + report.budget.toFixed(2) + "\nRemaining: $" + report.remaining.toFixed(4);
}

// ============================================================
// CONTENT PIPELINE (with GDrive re-host for article images)
// ============================================================

export async function processContentPipeline(url, options) {
  if (!options) options = {};
  var brand = options.brand || "Sakluma";
  var platforms = options.platforms || ["fb", "threads", "x"];
  console.log("[Pipeline] Scraping: " + url);

  var scrape = await firecrawlSearch(
    "Read this article: " + url + "\n\nReturn TWO things:\n1. Main image URL (og:image or first prominent image): IMAGE_URL: https://...\n2. Comprehensive article summary.\n\nFormat:\nIMAGE_URL: [url]\nCONTENT: [summary]",
    { model: "google/gemini-2.5-flash", depth: "high", maxResults: 1, maxTokens: 4096 }
  );
  if (!scrape.success) return { success: false, error: scrape.error };

  var fullResponse = scrape.content || "";
  var articleImage = extractImageUrl(fullResponse);
  if (articleImage) console.log("[Pipeline] Image found: " + articleImage.substring(0, 80));

  var articleContent = fullResponse.replace(/IMAGE_URL:\s*https?:\/\/[^\s\n]+/i, "").replace(/^CONTENT:\s*/im, "").trim();

  var results = {};
  var fmts = { fb: "Facebook post, storytelling, 3-5 paragraphs, hook + CTA. Bahasa Malaysia.", threads: "Threads, max 500 chars, punchy.", x: "X/Twitter, max 280 chars, 2-3 hashtags.", ig: "Instagram caption, aesthetic, 8-12 hashtags." };

  for (var p = 0; p < platforms.length; p++) {
    var cr = await chatCompletion({ model: "anthropic/claude-sonnet-4", messages: [{ role: "user", content: "Create a " + (fmts[platforms[p]] || fmts.fb) + "\nBrand: " + brand + "\nArticle:\n" + articleContent }], systemPrompt: AGENT_ROLES.content, maxTokens: 1500, temperature: 0.85 });
    results[platforms[p]] = { success: cr.success, content: cr.content, model: cr.model };
  }

  // Auto-save to Airtable
  var bestCaption = (results.fb && results.fb.success) ? results.fb.content : "";
  if (bestCaption) {
    var airtableFields = {
      "Title": extractSmartTitle(bestCaption, url),
      "Caption": bestCaption, "Platform": "Facebook", "Status": "Draft",
      "Created By": "AURA Pipeline", "Content Type": articleImage ? "Image" : "Post",
      "AI Caption": bestCaption, "AI Hashtags": extractHashtags(bestCaption),
      "AI Content Insights": "Source: " + url, "Hashtags": extractHashtags(bestCaption), "Brand": brand
    };

    // ✅ Re-host article image to GDrive (bypass hotlink protection)
    if (articleImage) {
      try {
        var gdResult = await downloadAndUploadToGDrive(articleImage);
        if (gdResult.success) {
          console.log("[Pipeline] Image re-hosted to GDrive: " + gdResult.url);
          airtableFields["Image URL"] = gdResult.url;
          airtableFields["Image file"] = [{ url: gdResult.url }];
        } else {
          console.log("[Pipeline] GDrive failed, using original URL");
          airtableFields["Image URL"] = articleImage;
        }
      } catch (gdErr) {
        console.error("[Pipeline] GDrive re-host failed: " + gdErr.message);
        airtableFields["Image URL"] = articleImage;
      }
    }

    var cleaned = {};
    for (var fk in airtableFields) {
      if (airtableFields[fk] !== null && airtableFields[fk] !== undefined && airtableFields[fk] !== "") {
        cleaned[fk] = airtableFields[fk];
      }
    }

    try { var rec = await airtableCreate(cleaned); console.log("[Pipeline] Saved: " + rec.id); }
    catch (err) { console.error("[Pipeline] Save failed: " + err.message); }
  }

  return { success: true, articleImage: articleImage, platforms: results };
}

// ============================================================
// MAIN ORCHESTRATOR (with Memory + Cost Optimization)
// ============================================================

export async function runOrchestrator(task, context) {
  if (!context) context = {};
  var start = Date.now();
  var chatId = context.chatId || "default";

  console.log("\n=================================");
  console.log("AURA v4.1.0 | " + task.substring(0, 80));
  console.log("=================================");

  try {
    await saveConversation(chatId, "user", task);

    var feedbacks = detectFeedback(task);
    for (var fi = 0; fi < feedbacks.length; fi++) {
      await savePreference(chatId, feedbacks[fi].key, feedbacks[fi].value, task);
    }

    var memContext = await buildContext(chatId, task);
    var history = memContext.history;
    var prefString = memContext.prefString;

    var taskType = detectTaskType(task);
    if (taskType === "report") { var rt = await handleReport(); return { response: rt, result: rt }; }

    if (taskType === "content_pipeline") {
      var urlMatch = task.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        var pr = await processContentPipeline(urlMatch[0]);
        if (pr.success) {
          var pt = "\uD83D\uDCF0 *Pipeline Complete*\n\n";
          if (pr.articleImage) pt += "Image: Attached to Airtable\n\n";
          if (pr.platforms.fb && pr.platforms.fb.success) pt += "*FB:*\n" + pr.platforms.fb.content + "\n\n";
          if (pr.platforms.threads && pr.platforms.threads.success) pt += "*Threads:*\n" + pr.platforms.threads.content + "\n\n";
          if (pr.platforms.x && pr.platforms.x.success) pt += "*X:*\n" + pr.platforms.x.content + "\n\n";
          pt += "\u2705 Auto-saved to Airtable as Draft";
          await saveConversation(chatId, "assistant", pt.substring(0, 2000));
          return { response: pt, result: pt };
        }
      }
      return { response: "Sila bagi URL.", error: true };
    }

    console.log("STEP 1: UNDERSTANDING");
    var understandingPrompt = BOSS_CHAT_PROMPT + prefString;
    var understanding = isCasualMessage(task) ? "Casual chat." : await callLLM(understandingPrompt, "Ringkaskan apa user nak (1 ayat).\nMessage: " + task, task, history);

    console.log("STEP 2: MEMORY");
    var memories = await searchMemory(task);

    console.log("STEP 3: PLANNING");
    var plan = await planTask(understanding, memories, task, history);
    var agentSet = {};
    for (var pp = 0; pp < plan.length; pp++) agentSet[plan[pp].agent] = true;
    console.log("PLAN: " + plan.length + " steps");

    console.log("STEP 4: EXECUTION");
    var results = [];
    var lastResult = null;
    var captionFromStep1 = null;
    var imageGenerated = false;
    var imageHttpUrl = null;
    var imageRawUrl = null;

    for (var s = 0; s < plan.length; s++) {
      var step = plan[s];
      console.log("[" + step.agent.toUpperCase() + "] " + step.action);

      var approved = true;
      if (plan.length > 1) approved = await bossApprove(step);
      if (!approved) { console.log("SKIPPED"); continue; }

      try {
        var result = await executeWithTools(step.agent, step.action, step.params || {}, {
          imageBase64: context.imageBase64 || null,
          originalTask: task, understanding: understanding,
          from: context.from || "Telegram", chatId: chatId,
          lastResult: lastResult, captionFromStep1: captionFromStep1,
          imageHttpUrl: imageHttpUrl, imageGenerated: imageGenerated,
          history: history
        });

        if (result && typeof result === "string") {
          if (result.startsWith("IMAGE_URL:")) {
            imageGenerated = true;
            imageRawUrl = result.replace("IMAGE_URL:", "");
            if (imageRawUrl.startsWith("http")) imageHttpUrl = imageRawUrl;
            result = "Image generated successfully.";
          } else if (result.startsWith("IMAGE_BASE64:")) {
            imageGenerated = true;
            imageRawUrl = result.replace("IMAGE_BASE64:", "");
            result = "Image generated (base64).";
          } else if (!captionFromStep1 && result.length > 50) {
            captionFromStep1 = result;
          }
        }

        lastResult = result;
        results.push({ step: step.step, agent: step.agent, action: step.action, result: result });
        console.log("[" + step.agent + "] COMPLETE");
      } catch (stepErr) {
        console.error("[STEP FAILED] " + stepErr.message);
        results.push({ step: step.step, agent: step.agent, action: step.action, result: "Step failed: " + stepErr.message });
      }
    }

    if (imageGenerated && imageRawUrl) {
      if (taskType === "image") {
        console.log("[Image] Standalone -> Telegram");
        try {
          if (imageRawUrl.startsWith("data:image")) {
            await sendTelegramBase64Image(imageRawUrl, "\uD83C\uDFA8 Generated by AURA", { chatId: chatId });
          } else if (imageRawUrl.startsWith("http")) {
            await sendTelegramImage(imageRawUrl, "\uD83C\uDFA8 Generated by AURA", { chatId: chatId });
          }
        } catch (imgErr) { console.error("[Image] Send failed: " + imgErr.message); }
      } else {
        console.log("[Image] Content flow -> Airtable");
      }
    }

    console.log("STEP 5: REVIEW");
    var finalResponse;
    if (results.length === 0) finalResponse = "Tak dapat proses. Cuba lagi.";
    else if (results.length === 1) finalResponse = results[0].result;
    else finalResponse = await bossReview(task, results, history);

    var trimmed = (finalResponse || "").trim();
    if (trimmed.indexOf("[{") === 0 || trimmed.indexOf("```") === 0) {
      finalResponse = await callLLM(BOSS_CHAT_PROMPT, "Rewrite as casual Malay reply. No JSON.\n\n" + finalResponse, task, history);
    }

    console.log("STEP 6: MEMORY");
    await saveMemory(task, finalResponse);
    await logActivity("orchestrator", task, finalResponse, "success");
    await saveConversation(chatId, "assistant", (finalResponse || "").substring(0, 2000));

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
