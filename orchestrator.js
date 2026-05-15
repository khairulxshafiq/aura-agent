import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
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
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

const BOSS_SYSTEM_PROMPT = `You are AURA — Matrol's personal AI assistant with real tools.

## IDENTITY
- Smart reliable friend, NOT salesperson, NOT corporate bot
- NEVER promote Sakluma unless asked

## HOW YOU TALK
- Casual Malay/English (Manglish): "Hey Matrol!", "Boleh je!", "Jap aku check"
- Short for simple, detailed when needed. Natural emoji.

## AVAILABLE TOOLS
- webSearch: search internet (Tavily)
- research: deep AI analysis (Gemini)
- generateImage: create AI images (Replicate Flux)
- analyzeImage: analyze/read images with AI vision (send base64 to Gemini)
- writeContent: write articles, copies, scripts
- generateCaption: quick social media captions

## PLANNING
1. CASUAL (hi, hello, thanks) -> 1 step, content agent, "casual reply", NO tools
2. CONTENT (caption, article) -> content agent, "use generateCaption" or "use writeContent"
3. IMAGE GEN (buat gambar) -> content agent, "use generateImage: [description]"
4. IMAGE ANALYSIS (analyze gambar, faham gambar, apa gambar ni) -> content agent, "use analyzeImage"
5. RESEARCH (cari info) -> ops agent, "use webSearch for [query]"
6. BUSINESS -> relevant agent + tools, max 4 steps

## OUTPUT: Return ONLY valid JSON array
[{"step":1,"agent":"content","action":"use analyzeImage","params":{},"description":"why","depends_on":null}]

## CRITICAL
- Include "use [toolName]" in action when tool needed
- Image analysis = "use analyzeImage" (image data is auto-provided)
- Casual = NO tools. Complex = max 4 steps.
- NEVER over-orchestrate`;

const AGENT_ROLES = {
  content: `You are AURA's Content agent.
CASUAL CHAT: Reply like a friend. Short, warm. NEVER mention business unless asked.
CONTENT: Write engaging content. Your tools: writeContent, generateCaption, generateImage, analyzeImage.`,
  finance: "AURA Finance agent. Pricing, costs, ROI, budgets. Casual Malay/English.",
  sales: "AURA Sales agent. Quotations, customer replies, CRM. Casual Malay/English.",
  marketing: "AURA Marketing agent. Campaigns, ads, market analysis. Casual Malay/English.",
  training: "AURA Training agent. SOPs, modules, quizzes. Casual Malay/English.",
  ops: "AURA Ops agent. Scheduling, logistics, status. Casual Malay/English.",
  architect: "AURA Architect agent. Tech, debugging, APIs. Casual Malay/English.",
};

async function callLLM(systemPrompt, userMessage) {
  try {
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENROUTER_API_KEY}` } }
    );
    const data = resp.data;
    if (data.error) return "Alamak, ada issue. Cuba lagi!";
    return data.choices?.[0]?.message?.content || "Takde response.";
  } catch (err) {
    console.error("LLM failed:", err.message);
    return "Eh sorry, technical issue. Cuba lagi!";
  }
}

function isCasualMessage(text) {
  const casual = [
    "hi","hello","hey","yo","sup","helo","hai","ok","okay","k","noted","okey",
    "thanks","terima kasih","tq","ty","thank","bye","bye2","tata",
    "test","testing","boleh","boleh ke","boleh guna",
    "apa khabar","how are you","good morning","selamat pagi","morning",
    "good night","selamat malam","haha","lol","wkwk",
    "nice","cool","best","gempak","ya","yep","yup","yes","no","tak","nope",
  ];
  const lower = text.toLowerCase().trim();
  if (casual.includes(lower)) return true;
  if (lower.length < 20) {
    for (const w of casual) { if (lower.startsWith(w)) return true; }
  }
  return false;
}

// === TOOL EXECUTION ENGINE (FIXED: image analysis uses context.imageBase64) ===
async function executeWithTools(agentName, action, params, context) {
  const a = action.toLowerCase();

  // IMAGE ANALYSIS — use base64 from context if available
  if (a.includes("use analyzeimage") || a.includes("analyze image") || a.includes("analisis gambar") || a.includes("analyze this image")) {
    console.log(`[Engine] ${agentName} -> analyzeImage`);
    // Priority: context.imageBase64 > params.imageUrl > params.url
    const imageInput = context?.imageBase64 || params.imageUrl || params.url || "";
    const question = params.question || context?.originalTask || "Analyze this image in detail.";
    return await analyzeImage(imageInput, question);
  }

  if (a.includes("use websearch") || a.includes("search internet") || a.includes("cari info")) {
    const q = params.query || params.topic || context?.originalTask || action;
    console.log(`[Engine] ${agentName} -> webSearch`);
    const r = await webSearch(q);
    return `Search Results:\n${r.answer || ""}\n\nSources:\n${(r.results || []).map((x) => `- ${x.title}: ${x.snippet}`).join("\n")}`;
  }

  if (a.includes("use research") || a.includes("deep analysis") || a.includes("analisis")) {
    console.log(`[Engine] ${agentName} -> research`);
    return await research(params.topic || context?.originalTask || action);
  }

  if (a.includes("use generateimage") || a.includes("buat gambar") || a.includes("create image") || a.includes("generate image")) {
    const prompt = params.prompt || params.description || action.replace(/use generateimage:?\s*/i, "");
    console.log(`[Engine] ${agentName} -> generateImage`);
    const url = await generateImage(prompt, { width: 1024, height: 1024 });
    if (url) return `Gambar siap! 🎨\n\n${url}`;
    return "Gambar tak berjaya. Cuba lagi?";
  }

  if (a.includes("use writecontent") || a.includes("tulis artikel") || a.includes("buat content")) {
    console.log(`[Engine] ${agentName} -> writeContent`);
    return await writeContent(params.brief || context?.originalTask || action, params.style || "casual", params.platform || "general");
  }

  if (a.includes("use generatecaption") || a.includes("buat caption") || a.includes("caption ig")) {
    console.log(`[Engine] ${agentName} -> generateCaption`);
    return await generateCaption(params.topic || context?.originalTask || action, params.platform || "instagram", params.mood || "engaging");
  }

  // No tool -> LLM
  console.log(`[Engine] ${agentName} -> LLM`);
  const role = AGENT_ROLES[agentName] || "Helpful assistant. Casual Malay/English.";
  return await callLLM(role, `TASK: ${action}\n${context?.originalTask ? "Original: " + context.originalTask : ""}\nReply casual, concise.`);
}

async function planTask(understanding, memories, task) {
  if (isCasualMessage(task)) {
    console.log("Fast path: casual");
    return [{ step: 1, agent: "content", action: "casual reply to: " + task, params: {}, description: "Chat", depends_on: null }];
  }

  const mem = memories.length > 0 ? "\nMEMORIES:\n" + memories.slice(0, 3).map((m) => `- ${m.task}`).join("\n") : "";

  const planResponse = await callLLM(BOSS_SYSTEM_PROMPT,
    `Plan for this. Return ONLY JSON array.\nREQUEST: ${task}\nUNDERSTANDING: ${understanding}${mem}\nIf tool needed, include "use [toolName]" in action.`
  );

  try {
    const m = planResponse.match(/\[[\s\S]*\]/);
    if (m) return JSON.parse(m[0]).slice(0, 4);
    return JSON.parse(planResponse).slice(0, 4);
  } catch (err) {
    console.error("Plan parse failed");
    return [{ step: 1, agent: "content", action: "respond to: " + task, params: {}, description: "Direct", depends_on: null }];
  }
}

async function bossApprove(step) {
  const d = await callLLM(BOSS_SYSTEM_PROMPT, `Reply PROCEED or SKIP (1 sentence).\nSTEP: ${JSON.stringify(step)}`);
  console.log("Boss:", d.substring(0, 80));
  return !d.toUpperCase().startsWith("SKIP");
}

async function bossReview(task, results) {
  const txt = results.map((r) => `[${r.agent}]: ${r.result}`).join("\n\n");
  return await callLLM(BOSS_SYSTEM_PROMPT, `Final response for Matrol.\nOriginal: ${task}\n\nResults:\n${txt}\nWrite like a friend. Casual.`);
}

export async function runOrchestrator(task, context = {}) {
  const start = Date.now();
  console.log("\nAURA v3.2.1 START");
  console.log("Task:", task);
  console.log("");

  console.log("Step 1: Understanding...");
  let understanding;
  if (isCasualMessage(task)) {
    understanding = "Casual message. Reply like a friend.";
  } else {
    understanding = await callLLM(BOSS_SYSTEM_PROMPT,
      `What does Matrol want? 1-2 sentences. Don't assume Sakluma.\nMessage: "${task}"`
    );
  }
  console.log("->", understanding);

  console.log("\nStep 2: Memory...");
  const memories = await searchMemory(task);
  console.log(`-> ${memories.length} memories`);

  console.log("\nStep 3: Planning...");
  const plan = await planTask(understanding, memories, task);
  const agents = [...new Set(plan.map((s) => s.agent))];
  console.log(`-> ${plan.length} step(s), agents: ${agents.join(", ")}`);

  console.log("\nStep 4: Executing...");
  const results = [];

  for (const step of plan.sort((a, b) => a.step - b.step)) {
    console.log(`[${step.agent.toUpperCase()}] ${step.action}`);

    let approved = plan.length <= 1 || (await bossApprove(step));
    if (!approved) { console.log("-> SKIPPED"); continue; }

    const result = await executeWithTools(step.agent, step.action, step.params || {},
      { ...context, originalTask: task, understanding }
    );

    results.push({ step: step.step, agent: step.agent, action: step.action, result });
    console.log(`-> [${step.agent}] done`);
  }

  console.log(`\nExecuted: ${results.length}/${plan.length}`);

  console.log("\nStep 5: Review...");
  let finalResponse;
  if (results.length === 0) finalResponse = "Tak dapat proses. Cuba explain lagi?";
  else if (results.length === 1) finalResponse = results[0].result;
  else finalResponse = await bossReview(task, results);

  console.log("Step 6: Memory...");
  await saveMemory(task, finalResponse);
  await logActivity("orchestrator", task, finalResponse, "success");

  const duration = Date.now() - start;
  console.log(`\nAURA v3.2.1 COMPLETE — ${duration}ms`);

  return { response: finalResponse, result: finalResponse, duration, stepsExecuted: results.length, totalSteps: plan.length, agents };
}
