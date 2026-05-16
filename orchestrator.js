import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { chooseModel } from "./tools/modelRouter.js";
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
} from "./tools/index.js";

var OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// PLANNING PROMPT (JSON output allowed)
var BOSS_PLAN_PROMPT = "You are AURA - Matrol personal AI assistant.\n\n" +
  "IDENTITY:\n" +
  "- Smart reliable friend, NOT salesperson, NOT corporate bot\n" +
  "- NEVER promote Sakluma unless asked\n\n" +
  "AVAILABLE TOOLS:\n" +
  "- webSearch: search internet (Tavily)\n" +
  "- research: deep AI analysis\n" +
  "- generateImage: create AI images\n" +
  "- analyzeImage: analyze/read images with AI vision\n" +
  "- writeContent: write articles, copies, scripts\n" +
  "- generateCaption: quick social media captions\n\n" +
  "PLANNING RULES:\n" +
  "1. CASUAL (hi, hello, thanks) -> 1 step, content agent, casual reply, NO tools\n" +
  "2. CONTENT (caption, article) -> content agent, use generateCaption or use writeContent\n" +
  "3. IMAGE GEN (buat gambar, generate) -> content agent, use generateImage: [description]\n" +
  "4. IMAGE ANALYSIS (analyze gambar) -> content agent, use analyzeImage\n" +
  "5. RESEARCH (cari info, trends) -> ops agent, use webSearch for [query]\n" +
  "6. CODING (error, bug, debug, API, code) -> coding agent, direct response\n" +
  "7. BUSINESS -> relevant agent + tools, max 4 steps\n\n" +
  "OUTPUT: Return ONLY valid JSON array\n" +
  '[{"step":1,"agent":"content","action":"casual reply","params":{},"description":"why","depends_on":null}]\n\n' +
  "CRITICAL:\n" +
  "- Include use [toolName] in action when tool needed\n" +
  "- Casual = NO tools. Complex = max 4 steps.\n" +
  "- NEVER over-orchestrate";

// CHAT PROMPT (Human reply, NEVER JSON)
var BOSS_CHAT_PROMPT = "You are AURA CORE v4 - Matrol personal AI operating system.\n\n" +
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

// AGENT ROLES
var AGENT_ROLES = {
  content: "You are AURA Content agent. Reply in casual Malay/English. " +
    "CASUAL CHAT: Reply like a friend. Short, warm. NEVER mention business unless asked. " +
    "CONTENT: Write engaging content. NEVER return JSON. Default language: Malay.",
  finance: "AURA Finance agent. Pricing, costs, ROI, budgets. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  sales: "AURA Sales agent. Quotations, customer replies, CRM. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  marketing: "AURA Marketing agent. Campaigns, ads, market analysis. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  training: "AURA Training agent. SOPs, modules, quizzes. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  ops: "AURA Ops agent. Scheduling, logistics, status. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  architect: "AURA Architect agent. Tech, debugging, APIs, infrastructure. Casual Malay/English. NEVER return JSON. Default language: Malay.",
  coding: "AURA Coding agent. Debug, code generation, log analysis, API troubleshooting, Railway, Supabase, Node.js. " +
    "Analyze carefully, identify root cause, propose production-ready fix. Casual Malay/English. NEVER return JSON. Default language: Malay."
};

// DYNAMIC MODEL ROUTING LLM
async function callLLM(systemPrompt, userMessage, taskType) {
  if (!taskType) { taskType = "general"; }
  var selected = chooseModel(taskType);
  console.log("");
  console.log("=================================");
  console.log("MODEL ROUTER");
  console.log("TASK TYPE: " + taskType.substring(0, 80));
  console.log("MODEL: " + selected.model);
  console.log("REASON: " + selected.reason);
  console.log("=================================");
  try {
    var resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: selected.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 1500
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + OPENROUTER_API_KEY
        },
        timeout: 30000
      }
    );
    var data = resp.data;
    if (data.error) {
      console.error("OPENROUTER ERROR: " + JSON.stringify(data.error).substring(0, 300));
      return "Alamak, AI issue jap. Cuba lagi.";
    }
    var content = "";
    if (data.choices && data.choices[0] && data.choices[0].message) {
      content = data.choices[0].message.content || "";
    }
    if (!content) {
      console.error("EMPTY RESPONSE from model");
      return "Takde response dari AI. Cuba lagi.";
    }
    console.log("MODEL RESPONSE SUCCESS");
    return content;
  } catch (err) {
    console.error("LLM FAILED: " + err.message);
    if (err.response) { console.error("STATUS: " + err.response.status); }
    return "Eh sorry, technical issue jap. Cuba lagi!";
  }
}

// CASUAL DETECTION
function isCasualMessage(text) {
  var casual = [
    "hi", "hello", "hey", "yo", "sup", "helo", "hai",
    "ok", "okay", "k", "noted", "okey",
    "thanks", "terima kasih", "tq", "ty", "thank",
    "bye", "bye2", "tata",
    "test", "testing", "boleh", "boleh ke", "boleh guna",
    "apa khabar", "how are you", "good morning", "selamat pagi", "morning",
    "good night", "selamat malam", "haha", "lol", "wkwk",
    "nice", "cool", "best", "gempak",
    "ya", "yep", "yup", "yes", "no", "tak", "nope"
  ];
  var lower = text.toLowerCase().trim();
  for (var i = 0; i < casual.length; i++) {
    if (lower === casual[i]) { return true; }
  }
  if (lower.length < 20) {
    for (var j = 0; j < casual.length; j++) {
      if (lower.indexOf(casual[j]) === 0) { return true; }
    }
  }
  return false;
}

// TOOL EXECUTION ENGINE
async function executeWithTools(agentName, action, params, context) {
  var a = action.toLowerCase();
  console.log("");
  console.log("---------------------------------");
  console.log("EXECUTING AGENT: " + agentName);
  console.log("ACTION: " + action);
  console.log("---------------------------------");

  // IMAGE ANALYSIS
  if (a.indexOf("use analyzeimage") > -1 || a.indexOf("analyze image") > -1 || a.indexOf("analisis gambar") > -1 || a.indexOf("analyze this image") > -1) {
    console.log("[Engine] " + agentName + " -> analyzeImage");
    var imageInput = "";
    if (context && context.imageBase64) { imageInput = context.imageBase64; }
    else if (params.imageUrl) { imageInput = params.imageUrl; }
    else if (params.url) { imageInput = params.url; }
    var question = params.question || (context && context.originalTask) || "Analyze this image in detail.";
    return await analyzeImage(imageInput, question);
  }

  // WEB SEARCH
  if (a.indexOf("use websearch") > -1 || a.indexOf("search internet") > -1 || a.indexOf("cari info") > -1) {
    var q = params.query || params.topic || (context && context.originalTask) || action;
    console.log("[Engine] " + agentName + " -> webSearch: " + q);
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
    if (imgUrl) { return "Gambar siap!\n\n" + imgUrl; }
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

  // NO TOOL -> LLM FALLBACK
  console.log("[Engine] " + agentName + " -> LLM fallback");
  var role = AGENT_ROLES[agentName] || "Helpful assistant. Casual Malay/English. NEVER return JSON.";
  var originalInfo = "";
  if (context && context.originalTask) { originalInfo = "\nOriginal request: " + context.originalTask; }
  return await callLLM(role, "TASK: " + action + originalInfo + "\nReply casual in Malay. Do NOT return JSON.", action);
}

// PLANNER
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
  var planResponse = await callLLM(BOSS_PLAN_PROMPT, "Plan for this. Return ONLY JSON array.\nREQUEST: " + task + "\nUNDERSTANDING: " + understanding + mem + "\nIf tool needed, include use [toolName] in action.", task);
  try {
    var match = planResponse.match(/\[[\s\S]*\]/);
    if (match) { return JSON.parse(match[0]).slice(0, 4); }
    return JSON.parse(planResponse).slice(0, 4);
  } catch (err) {
    console.error("Plan parse failed: " + err.message);
    return [{ step: 1, agent: "content", action: "respond to: " + task, params: {}, description: "Direct", depends_on: null }];
  }
}

// BOSS APPROVE
async function bossApprove(step) {
  var d = await callLLM(BOSS_CHAT_PROMPT, "Reply PROCEED or SKIP (1 word + 1 sentence reason).\nSTEP: " + JSON.stringify(step), "approve");
  console.log("Boss: " + d.substring(0, 80));
  return d.toUpperCase().indexOf("SKIP") !== 0;
}

// BOSS REVIEW
async function bossReview(task, results) {
  var txt = results.map(function(r) { return "[" + r.agent + "]: " + r.result; }).join("\n\n");
  return await callLLM(BOSS_CHAT_PROMPT, "Write a final response for Matrol based on these results.\nOriginal request: " + task + "\n\nResults:\n" + txt + "\n\nWrite like a friend. Casual Malay. Do NOT return JSON.", task);
}

// MAIN ORCHESTRATOR
export async function runOrchestrator(task, context) {
  if (!context) { context = {}; }
  var start = Date.now();
  console.log("");
  console.log("=================================");
  console.log("AURA v4.0.0 ORCHESTRATOR START");
  console.log("USER TASK: " + task);
  console.log("TIME: " + new Date().toISOString());
  console.log("=================================");

  try {
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
    for (var p = 0; p < plan.length; p++) { agentSet[plan[p].agent] = true; }
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
      if (sortedPlan.length > 1) { approved = await bossApprove(step); }
      if (!approved) { console.log("STEP SKIPPED"); continue; }
      var result = await executeWithTools(step.agent, step.action, step.params || {}, { imageBase64: context.imageBase64 || null, originalTask: task, understanding: understanding });
      results.push({ step: step.step, agent: step.agent, action: step.action, result: result });
      console.log("[" + step.agent + "] COMPLETE");
    }
    console.log("EXECUTED: " + results.length + "/" + plan.length);

    // STEP 5 - REVIEW
    console.log("STEP 5: FINAL REVIEW");
    var finalResponse;
    if (results.length === 0) { finalResponse = "Tak dapat proses. Cuba explain lagi?"; }
    else if (results.length === 1) { finalResponse = results[0].result; }
    else { finalResponse = await bossReview(task, results); }

    // SAFETY: strip JSON if accidentally returned
    var trimmed = finalResponse.trim();
    if (trimmed.indexOf("[{") === 0 || trimmed.indexOf("```json") === 0 || trimmed.indexOf("```") === 0) {
      console.log("WARNING: Response looks like JSON, regenerating...");
      finalResponse = await callLLM(BOSS_CHAT_PROMPT, "Matrol asked: " + task + "\n\nYour analysis:\n" + finalResponse + "\n\nNow rewrite this as a friendly casual reply in Malay. NO JSON. NO code blocks.", task);
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
    console.log("AURA v4.0.0 COMPLETE - " + duration + "ms");
    console.log("AGENTS: " + agents.join(", "));
    console.log("STEPS: " + results.length + "/" + plan.length);
    console.log("=================================");

    return { response: finalResponse, result: finalResponse, duration: duration, stepsExecuted: results.length, totalSteps: plan.length, agents: agents };

  } catch (error) {
    console.error("ORCHESTRATOR FAILED: " + (error.message || error));
    return { response: "Aduhh ada issue technical. Cuba lagi jap.", error: true };
  }
}
