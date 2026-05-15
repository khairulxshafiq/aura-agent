// orchestrator.js — AURA v4.0.0
// Dynamic Model Routing + Production Logging + Bug Fixes

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

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// =============================================
// PROMPTS — SEPARATED BY PURPOSE
// =============================================

const BOSS_PLAN_PROMPT = `You are AURA — Matrol's personal AI assistant.

## IDENTITY
- Smart reliable friend, NOT salesperson, NOT corporate bot
- NEVER promote Sakluma unless asked

## AVAILABLE TOOLS
- webSearch: search internet (Tavily)
- research: deep AI analysis (Gemini)
- generateImage: create AI images (Replicate Flux)
- analyzeImage: analyze/read images with AI vision
- writeContent: write articles, copies, scripts
- generateCaption: quick social media captions

## PLANNING RULES
1. CASUAL (hi, hello, thanks) -> 1 step, content agent, "casual reply", NO tools
2. CONTENT (caption, article) -> content agent, "use generateCaption" or "use writeContent"
3. IMAGE GEN (buat gambar) -> content agent, "use generateImage: [description]"
4. IMAGE ANALYSIS (analyze gambar) -> content agent, "use analyzeImage"
5. RESEARCH (cari info, trends) -> ops agent, "use webSearch for [query]"
6. CODING (error, bug, debug, API) -> coding agent, direct response
7. BUSINESS -> relevant agent + tools, max 4 steps

## OUTPUT: Return ONLY valid JSON array
[{"step":1,"agent":"content","action":"use analyzeImage","params":{},"description":"why","depends_on":null}]

## CRITICAL
- Include "use [toolName]" in action when tool needed
- Casual = NO tools. Complex = max 4 steps.
- NEVER over-orchestrate`;

const BOSS_CHAT_PROMPT = `You are AURA — Matrol's personal AI assistant.
Smart reliable friend. Casual Malay/English (Manglish).
Short for simple, detailed when needed. Natural emoji.
NEVER promote Sakluma unless asked. NEVER return JSON.
Reply like a real friend would.`;

// =============================================
// AGENT ROLES
// =============================================

const AGENT_ROLES = {
  content: `You are AURA's Content agent.
CASUAL CHAT: Reply like a friend. Short, warm. NEVER mention business unless asked.
CONTENT: Write engaging content. Your tools: writeContent, generateCaption, generateImage, analyzeImage.
NEVER return JSON. Reply naturally.`,

  finance:
    "AURA Finance agent. Pricing, costs, ROI, budgets. Casual Malay/English. NEVER return JSON.",
  sales:
    "AURA Sales agent. Quotations, customer replies, CRM. Casual Malay/English. NEVER return JSON.",
  marketing:
    "AURA Marketing agent. Campaigns, ads, market analysis. Casual Malay/English. NEVER return JSON.",
  training:
    "AURA Training agent. SOPs, modules, quizzes. Casual Malay/English. NEVER return JSON.",
  ops:
    "AURA Ops agent. Scheduling, logistics, status. Casual Malay/English. NEVER return JSON.",
  architect:
    "AURA Architect agent. Tech, debugging, APIs. Casual Malay/English. NEVER return JSON.",
  coding:
    "AURA Coding agent. Debug, code generation, log analysis, API troubleshooting, infrastructure. Casual Malay/English. NEVER return JSON.",
};

// =============================================
// DYNAMIC MODEL ROUTING LLM
// =============================================

async function callLLM(systemPrompt, userMessage, taskType = "general") {

  const selected = chooseModel(taskType);

  console.log("\n=================================");
  console.log("🧠 MODEL ROUTER");
  console.log("📌 TASK TYPE:", taskType.substring(0, 80));
  console.log("🤖 MODEL:", selected.model);
  console.log("💡 REASON:", selected.reason);
  console.log("=================================\n");

  try {

    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: selected.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        timeout: 30000,
      }
    );

    const data = resp.data;

    if (data.error) {
      console.error("❌ OPENROUTER ERROR:", JSON.stringify(data.error).substring(0, 300));
      return "Alamak, AI issue jap 😭";
    }

    const content = data.choices?.[0]?.message?.content || "";

    if (!content) {
      console.error("❌ EMPTY RESPONSE from model");
      return "Takde response dari AI. Cuba lagi.";
    }

    console.log("✅ MODEL RESPONSE SUCCESS");

    return content;

  } catch (err) {

    console.error("❌ LLM FAILED:", err.message);

    if (err.response) {
      console.error("❌ STATUS:", err.response.status);
      console.error("❌ DATA:", JSON.stringify(err.response.data).substring(0, 300));
    }

    return "Eh sorry, technical issue jap 😭";
  }
}

// =============================================
// CASUAL DETECTION
// =============================================

function isCasualMessage(text) {
  const casual = [
    "hi", "hello", "hey", "yo", "sup", "helo", "hai",
    "ok", "okay", "k", "noted", "okey",
    "thanks", "terima kasih", "tq", "ty", "thank",
    "bye", "bye2", "tata",
    "test", "testing", "boleh", "boleh ke", "boleh guna",
    "apa khabar", "how are you", "good morning", "selamat pagi", "morning",
    "good night", "selamat malam", "haha", "lol", "wkwk",
    "nice", "cool", "best", "gempak",
    "ya", "yep", "yup", "yes", "no", "tak", "nope",
  ];

  const lower = text.toLowerCase().trim();

  if (casual.includes(lower)) return true;

  if (lower.length < 20) {
    for (const w of casual) {
      if (lower.startsWith(w)) return true;
    }
  }

  return false;
}

// =============================================
// TOOL EXECUTION ENGINE
// =============================================

async function executeWithTools(agentName, action, params, context) {

  const a = action.toLowerCase();

  console.log("\n---------------------------------");
  console.log(`🚀 EXECUTING AGENT: ${agentName}`);
  console.log(`🎯 ACTION: ${action}`);
  console.log("---------------------------------\n");

  // IMAGE ANALYSIS
  if (
    a.includes("use analyzeimage") ||
    a.includes("analyze image") ||
    a.includes("analisis gambar") ||
    a.includes("analyze this image")
  ) {
    console.log(`🔧 [Engine] ${agentName} -> analyzeImage`);

    const imageInput =
      context?.imageBase64 || params.imageUrl || params.url || "";

    const question =
      params.question || context?.originalTask || "Analyze this image in detail.";

    return await analyzeImage(imageInput, question);
  }

  // WEB SEARCH
  if (
    a.includes("use websearch") ||
    a.includes("search internet") ||
    a.includes("cari info")
  ) {
    const q = params.query || params.topic || context?.originalTask || action;

    console.log(`🔧 [Engine] ${agentName} -> webSearch`);
    console.log(`🔍 QUERY: ${q}`);

    const r = await webSearch(q);

    return `Search Results:\n${r.answer || ""}\n\nSources:\n${(r.results || [])
      .map((x) => `- ${x.title}: ${x.snippet}`)
      .join("\n")}`;
  }

  // RESEARCH
  if (
    a.includes("use research") ||
    a.includes("deep analysis") ||
    a.includes("analisis")
  ) {
    console.log(`🔧 [Engine] ${agentName} -> research`);

    return await research(params.topic || context?.originalTask || action);
  }

  // IMAGE GENERATION
  if (
    a.includes("use generateimage") ||
    a.includes("buat gambar") ||
    a.includes("create image") ||
    a.includes("generate image")
  ) {
    const prompt =
      params.prompt ||
      params.description ||
      action.replace(/use generateimage:?\s*/i, "");

    console.log("🎨 IMAGE GENERATION STARTED");
    console.log("📝 PROMPT:", prompt);

    const url = await generateImage(prompt, { width: 1024, height: 1024 });

    if (url) {
      console.log("✅ IMAGE GENERATED SUCCESS");
      return `Gambar siap! 🎨\n\n${url}`;
    }

    console.error("❌ IMAGE GENERATION FAILED");
    return "Gambar tak berjaya 😭 Cuba lagi?";
  }

  // WRITE CONTENT
  if (
    a.includes("use writecontent") ||
    a.includes("tulis artikel") ||
    a.includes("buat content")
  ) {
    console.log(`🔧 [Engine] ${agentName} -> writeContent`);

    return await writeContent(
      params.brief || context?.originalTask || action,
      params.style || "casual",
      params.platform || "general"
    );
  }

  // CAPTION
  if (
    a.includes("use generatecaption") ||
    a.includes("buat caption") ||
    a.includes("caption ig")
  ) {
    console.log(`🔧 [Engine] ${agentName} -> generateCaption`);

    return await generateCaption(
      params.topic || context?.originalTask || action,
      params.platform || "instagram",
      params.mood || "engaging"
    );
  }

  // NO TOOL -> LLM FALLBACK
  console.log(`🔧 [Engine] ${agentName} -> LLM fallback`);

  const role = AGENT_ROLES[agentName] || "Helpful assistant. Casual Malay/English. NEVER return JSON.";

  return await callLLM(
    role,
    `TASK: ${action}\n${
      context?.originalTask ? "Original request: " + context.originalTask : ""
    }\nReply casual and concise. Do NOT return JSON.`,
    action
  );
}

// =============================================
// PLANNER
// =============================================

async function planTask(understanding, memories, task) {

  if (isCasualMessage(task)) {
    console.log("⚡ Fast path: casual");
    return [
      {
        step: 1,
        agent: "content",
        action: "casual reply to: " + task,
        params: {},
        description: "Chat",
        depends_on: null,
      },
    ];
  }

  const mem =
    memories.length > 0
      ? "\nMEMORIES:\n" +
        memories
          .slice(0, 3)
          .map((m) => `- ${m.task}`)
          .join("\n")
      : "";

  // USE PLAN PROMPT (with JSON instruction) ONLY HERE
  const planResponse = await callLLM(
    BOSS_PLAN_PROMPT,
    `Plan for this. Return ONLY JSON array.\nREQUEST: ${task}\nUNDERSTANDING: ${understanding}${mem}\nIf tool needed, include "use [toolName]" in action.`,
    task
  );

  try {
    const m = planResponse.match(/\[[\s\S]*\]/);
    if (m) return JSON.parse(m[0]).slice(0, 4);
    return JSON.parse(planResponse).slice(0, 4);
  } catch (err) {
    console.error("❌ Plan parse failed:", err.message);
    console.error("❌ Raw plan:", planResponse.substring(0, 200));
    return [
      {
        step: 1,
        agent: "content",
        action: "respond to: " + task,
        params: {},
        description: "Direct",
        depends_on: null,
      },
    ];
  }
}

// =============================================
// BOSS APPROVE
// =============================================

async function bossApprove(step) {

  const d = await callLLM(
    BOSS_CHAT_PROMPT,
    `Reply PROCEED or SKIP (1 word + 1 sentence reason).\nSTEP: ${JSON.stringify(step)}`,
    "approve"
  );

  console.log("👔 Boss:", d.substring(0, 80));

  return !d.toUpperCase().startsWith("SKIP");
}

// =============================================
// BOSS REVIEW
// =============================================

async function bossReview(task, results) {

  const txt = results
    .map((r) => `[${r.agent}]: ${r.result}`)
    .join("\n\n");

  // USE CHAT PROMPT (NO JSON instruction)
  return await callLLM(
    BOSS_CHAT_PROMPT,
    `Write a final response for Matrol based on these results.\nOriginal request: ${task}\n\nResults:\n${txt}\n\nWrite like a friend. Casual. Do NOT return JSON.`,
    task
  );
}

// =============================================
// MAIN ORCHESTRATOR
// =============================================

export async function runOrchestrator(task, context = {}) {

  const start = Date.now();

  console.log("\n=================================");
  console.log("🚀 AURA v4.0.0 ORCHESTRATOR START");
  console.log("📝 USER TASK:", task);
  console.log("⏰ TIME:", new Date().toISOString());
  console.log("=================================\n");

  try {

    // =========================
    // STEP 1 — UNDERSTANDING
    // =========================

    console.log("🧠 STEP 1: UNDERSTANDING");

    let understanding;

    if (isCasualMessage(task)) {
      understanding = "Casual message. Reply like a friend.";
      console.log("✅ CASUAL MESSAGE DETECTED");
    } else {
      // USE CHAT PROMPT (not plan prompt)
      understanding = await callLLM(
        BOSS_CHAT_PROMPT,
        `What does Matrol want? Reply in 1-2 sentences. Don't assume Sakluma.\nMessage: "${task}"`,
        task
      );
    }

    console.log("📌 UNDERSTANDING:", understanding);

    // =========================
    // STEP 2 — MEMORY
    // =========================

    console.log("\n🧠 STEP 2: MEMORY SEARCH");

    const memories = await searchMemory(task);

    console.log(`✅ MEMORIES FOUND: ${memories.length}`);

    // =========================
    // STEP 3 — PLANNING
    // =========================

    console.log("\n🧠 STEP 3: PLANNING");

    const plan = await planTask(understanding, memories, task);

    const agents = [...new Set(plan.map((s) => s.agent))];

    console.log("✅ PLAN CREATED");
    console.log(`📌 STEPS: ${plan.length}`);
    console.log(`🤖 AGENTS: ${agents.join(", ")}`);
    console.log("📋 PLAN:", JSON.stringify(plan, null, 2));

    // =========================
    // STEP 4 — EXECUTION
    // =========================

    console.log("\n🧠 STEP 4: EXECUTION");

    const results = [];

    for (const step of plan.sort((a, b) => a.step - b.step)) {

      console.log(`\n[${step.agent.toUpperCase()}] ${step.action}`);

      let approved = plan.length <= 1 || (await bossApprove(step));

      if (!approved) {
        console.log("⏭️ STEP SKIPPED");
        continue;
      }

      const result = await executeWithTools(
        step.agent,
        step.action,
        step.params || {},
        {
          ...context,
          originalTask: task,
          understanding,
        }
      );

      results.push({
        step: step.step,
        agent: step.agent,
        action: step.action,
        result,
      });

      console.log(`✅ [${step.agent}] COMPLETE`);
    }

    console.log(`\n📊 EXECUTED: ${results.length}/${plan.length}`);

    // =========================
    // STEP 5 — REVIEW
    // =========================

    console.log("\n🧠 STEP 5: FINAL REVIEW");

    let finalResponse;

    if (results.length === 0) {
      finalResponse = "Tak dapat proses. Cuba explain lagi?";
    } else if (results.length === 1) {
      finalResponse = results[0].result;
    } else {
      finalResponse = await bossReview(task, results);
    }

    // SAFETY: strip JSON if accidentally returned
    if (finalResponse.trim().startsWith("[{") || finalResponse.trim().startsWith("```json")) {
      console.warn("⚠️ Response looks like JSON, regenerating...");
      finalResponse = await callLLM(
        BOSS_CHAT_PROMPT,
        `Matrol asked: "${task}"\n\nYour analysis:\n${finalResponse}\n\nNow rewrite this as a friendly casual reply. NO JSON. NO code blocks.`,
        task
      );
    }

    console.log("✅ FINAL RESPONSE READY");

    // =========================
    // STEP 6 — MEMORY SAVE
    // =========================

    console.log("\n🧠 STEP 6: MEMORY SAVE");

    await saveMemory(task, finalResponse);
    await logActivity("orchestrator", task, finalResponse, "success");

    console.log("✅ MEMORY SAVED");

    const duration = Date.now() - start;

    console.log("\n=================================");
    console.log("✅ AURA v4.0.0 COMPLETE");
    console.log(`⚡ DURATION: ${duration}ms`);
    console.log(`🤖 AGENTS USED: ${agents.join(", ")}`);
    console.log(`📊 STEPS: ${results.length}/${plan.length}`);
    console.log("=================================\n");

    return {
      response: finalResponse,
      result: finalResponse,
      duration,
      stepsExecuted: results.length,
      totalSteps: plan.length,
      agents,
    };

  } catch (error) {

    console.error("\n=================================");
    console.error("❌ ORCHESTRATOR FAILED");
    console.error("ERROR:", error.message || error);
    console.error("STACK:", error.stack || "no stack");
    console.error("=================================\n");

    return {
      response: "Aduhh ada issue technical 😭 Cuba lagi jap.",
      error: true,
    };
  }
}
