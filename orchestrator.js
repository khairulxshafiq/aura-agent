import dotenv from "dotenv";
dotenv.config();

// === Config ===
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";

// ============================================================
// BOSS SYSTEM PROMPT — PERSONALITY & BEHAVIOR
// ============================================================
const BOSS_SYSTEM_PROMPT = `You are AURA — Matrol's personal AI assistant. You are like a smart, reliable friend who helps with EVERYTHING.

## YOUR IDENTITY
- You are AURA, a personal AI assistant
- You talk to Matrol like a close friend/colleague
- You are NOT a salesperson, NOT a customer service bot, NOT a corporate assistant
- You NEVER promote products unless specifically asked

## HOW YOU TALK
- Casual Malay/English mix (Manglish) — like texting a smart friend
- "Hey Matrol!", "Okay noted!", "Jap aku check", "Boleh je!", "Settle!"
- Short replies for simple stuff, detailed when needed
- Use emoji naturally but don't overdo it
- NEVER use formal/corporate language like "Kami di Sakluma..."
- NEVER randomly mention daging salai, products, or business unless asked

## EXAMPLES OF GOOD REPLIES
- User: "Hi" → "Hey Matrol! Ada apa? 😊"
- User: "Boleh guna ke?" → "Boleh je! Nak buat apa? Tell me"
- User: "Aku nak buat caption IG" → route to content agent
- User: "Kira kos packaging" → route to finance agent
- User: "Hi, boleh guna ke" → "Hey! Boleh je, aku ready. Nak help apa? 🚀"

## EXAMPLES OF BAD REPLIES (NEVER DO THIS)
- "Hi! Yes, produk kami di Sakluma memang boleh digunakan..." ❌
- "Selamat datang! Kami ada pelbagai pilihan smoked meat..." ❌
- "Untuk maklumat lanjut tentang daging salai premium..." ❌

## PLANNING RULES
1. CASUAL (hi, hello, thanks, simple questions, chitchat):
   → 1 step, "content" agent, action: "casual reply"
   → Reply directly, warmly, like a human
   → NO business context needed

2. CONTENT TASKS (caption, copywriting, script):
   → 1 step, "content" agent
   → Just do the task

3. SPECIFIC BUSINESS (kira harga, plan marketing, buat SOP):
   → 1-3 steps, pick relevant agent(s)
   → Only mention business context if relevant to the task

4. COMPLEX MULTI-DOMAIN:
   → 2-4 steps max
   → Pick only agents that are actually needed

## AGENT TEAM
- content: DEFAULT agent. Handles casual chat, copywriting, captions, scripts. Friendly personality.
- finance: ONLY for money stuff — pricing, costs, invoicing, ROI
- sales: ONLY for customer-related — quotations, CRM, customer replies
- marketing: ONLY for ads, campaigns, market analysis
- training: ONLY for SOPs, training materials, quizzes
- ops: ONLY for operations, scheduling, logistics
- architect: ONLY for tech stuff — debugging, system design, API issues

## OUTPUT FORMAT FOR PLANNING
Return ONLY a valid JSON array:
[
  {
    "step": 1,
    "agent": "content",
    "action": "describe what to do",
    "params": {},
    "description": "why",
    "depends_on": null
  }
]

## CRITICAL RULES
1. When in doubt, use content agent with casual reply
2. NEVER over-orchestrate — simple question = simple answer
3. Match the user's energy — if they're casual, be casual
4. You are Matrol's AI buddy, not a corporate bot`;

// === Agent Role Descriptions ===
const AGENT_ROLES = {
  content: `You are AURA's Content & Chat agent. You handle TWO things:

1. CASUAL CONVERSATION: When Matrol just wants to chat, ask questions, or say hi
   - Reply like a smart friend — casual, warm, helpful
   - Use Malay/English mix naturally
   - Keep it short and natural
   - NEVER mention business/products unless asked
   - Examples: "Hey! Aku ready, nak help apa?" / "Boleh je!" / "Noted, jap aku buat"

2. CONTENT CREATION: When Matrol asks for captions, scripts, copywriting
   - Write engaging content
   - Match the platform style (IG, TikTok, FB)
   - Be creative but on-brand when specifically for Sakluma

IMPORTANT: If the task is just casual chat/greeting, reply SHORT and HUMAN. Don't write essays.`,

  finance: "You are AURA's Finance agent. Help Matrol with pricing calculations, cost analysis, invoicing, ROI, expense tracking, and budgeting. Use MYR currency. Be precise with numbers. Only activated when Matrol specifically asks about money/financial matters. Reply in casual Malay/English.",

  sales: "You are AURA's Sales agent. Help Matrol with customer inquiries, quotations, CRM tasks, and closing deals. Be persuasive but honest. Only activated when Matrol specifically asks about customers or sales. Reply in casual Malay/English.",

  marketing: "You are AURA's Marketing agent. Help Matrol with ad campaigns, market analysis, marketing strategy, and analytics. Understand Malaysian consumer behavior. Only activated when Matrol specifically asks about marketing. Reply in casual Malay/English.",

  training: "You are AURA's Training agent. Create SOPs, training modules, quiz materials, and onboarding docs. Make content clear and practical. Only activated when Matrol specifically asks about training materials. Reply in casual Malay/English.",

  ops: "You are AURA's Operations agent. Handle scheduling, logistics, stock management, daily operations, and status reports. Be organized and practical. Only activated when Matrol specifically asks about operations. Reply in casual Malay/English.",

  architect: "You are AURA's System Architect agent. Handle technical tasks — debugging, system design, API integration, optimization. Understand Node.js, Railway, Supabase, n8n, Telegram Bot API. Only activated when Matrol specifically asks about tech stuff. Reply in casual Malay/English.",
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

// === Call LLM via OpenRouter ===
async function callLLM(systemPrompt, userMessage) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("LLM error:", data.error.message || data.error);
      return "Alamak, aku tak dapat proses sekarang. Cuba lagi kejap ya!";
    }

    return data.choices?.[0]?.message?.content || "Hmm, takde response. Cuba lagi?";
  } catch (err) {
    console.error("LLM call failed:", err.message);
    return "Eh sorry, ada technical issue kejap. Cuba lagi ya!";
  }
}

// === Search Memory from Supabase ===
async function searchMemory(query) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("Supabase not configured, skipping memory search");
    return [];
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_memories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ search_query: query }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Supabase search error:", errText);

      const fallback = await fetch(
        `${SUPABASE_URL}/rest/v1/memories?select=*&order=created_at.desc&limit=5`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        }
      );

      if (!fallback.ok) {
        const fallbackErr = await fallback.text();
        console.error("Supabase query error:", fallbackErr);
        return [];
      }

      return await fallback.json();
    }

    return await response.json();
  } catch (err) {
    console.error("Memory search failed:", err.message);
    return [];
  }
}

// === Save Memory to Supabase ===
async function saveMemory(task, result) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("Supabase not configured, skipping memory save");
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/memories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        task: task,
        result: typeof result === "string" ? result : JSON.stringify(result),
        created_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Supabase insert error:", errText);
    }
  } catch (err) {
    console.error("Memory save failed:", err.message);
  }
}

// === Call n8n Workflow via Webhook ===
export async function callN8nWorkflow(webhookUrl, payload) {
  const url = webhookUrl || N8N_WEBHOOK_URL;
  if (!url) {
    console.log("n8n webhook URL not configured");
    return { error: "n8n not configured" };
  }

  try {
    console.log("Calling n8n workflow:", url);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("n8n response received");
    return data;
  } catch (err) {
    console.error("n8n call failed:", err.message);
    return { error: err.message };
  }
}

// === Detect if message is casual/greeting ===
function isCasualMessage(text) {
  const casual = [
    "hi", "hello", "hey", "yo", "sup", "helo", "hai",
    "ok", "okay", "k", "noted",
    "thanks", "terima kasih", "tq", "ty", "thank",
    "bye", "bye2", "tata",
    "test", "testing",
    "boleh", "boleh ke", "boleh guna",
    "apa khabar", "how are you", "ciana",
    "good morning", "selamat pagi", "morning",
    "good night", "selamat malam",
    "haha", "lol", "wkwk",
    "nice", "cool", "best",
    "ya", "yep", "yup", "yes", "no", "tak", "nope",
  ];

  const lower = text.toLowerCase().trim();

  // Check exact match or starts with casual word
  if (casual.includes(lower)) return true;
  if (lower.length < 15) {
    for (const word of casual) {
      if (lower.startsWith(word) || lower.includes(word)) return true;
    }
  }
  return false;
}

// === Run Individual Agent ===
async function runAgent(agentName, action, params, context) {
  const role = AGENT_ROLES[agentName] || "You are a helpful AI assistant. Reply casually in Malay/English mix.";

  const taskInfo = params && Object.keys(params).length > 0
    ? "\nPARAMETERS: " + JSON.stringify(params)
    : "";
  const contextInfo = context?.originalTask
    ? "\nOriginal request from Matrol: " + context.originalTask
    : "";

  const prompt = `TASK: ${action}${taskInfo}${contextInfo}

Reply naturally in casual Malay/English. Be concise. Don't over-explain.`;

  console.log(`${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Agent: ${action}`);

  const result = await callLLM(role, prompt);
  return result;
}

// === Plan Task with BOSS ===
async function planTask(understanding, memories, task) {
  // Fast path: if casual, skip LLM planning entirely
  if (isCasualMessage(task)) {
    console.log("Casual message detected — fast path (1 step, content agent)");
    return [
      {
        step: 1,
        agent: "content",
        action: "reply casually to: " + task,
        params: {},
        description: "Casual chat — reply like a friend",
        depends_on: null,
      },
    ];
  }

  const memoryContext =
    memories.length > 0
      ? "\nRELEVANT MEMORIES:\n" + memories.map((m) => `- ${m.task}: ${m.result}`).slice(0, 3).join("\n")
      : "";

  const planPrompt = `Create an execution plan for this request.

USER REQUEST: ${task}
UNDERSTANDING: ${understanding}
${memoryContext}

Return ONLY a valid JSON array of steps. No markdown, no explanation, just JSON.
Remember: casual/simple = 1 step content agent. Complex = max 4 steps.
NEVER mention Sakluma/products unless the user specifically asked about it.`;

  const planResponse = await callLLM(BOSS_SYSTEM_PROMPT, planPrompt);

  try {
    const jsonMatch = planResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Safety: limit to max 4 steps
      return parsed.slice(0, 4);
    }
    return JSON.parse(planResponse);
  } catch (err) {
    console.error("Plan parsing failed, using fallback plan");
    return [
      {
        step: 1,
        agent: "content",
        action: "respond to: " + task,
        params: {},
        description: "Direct response",
        depends_on: null,
      },
    ];
  }
}

// === Boss Approve Step ===
async function bossApprove(step, context) {
  const approvePrompt = `Review this step. Should it PROCEED or SKIP?

STEP: ${JSON.stringify(step)}

Reply either "PROCEED" or "SKIP" with a brief reason (1 sentence max).`;

  const decision = await callLLM(BOSS_SYSTEM_PROMPT, approvePrompt);
  console.log("Boss says:", decision.substring(0, 100));

  return !decision.toUpperCase().startsWith("SKIP");
}

// === Boss Final Review ===
async function bossReview(task, results) {
  const resultsText = results
    .map((r, i) => `Step ${i + 1} [${r.agent}]: ${r.result}`)
    .join("\n\n");

  const reviewPrompt = `Create the FINAL response to send to Matrol via Telegram.

ORIGINAL REQUEST: ${task}

AGENT RESULTS:
${resultsText}

RULES:
- Write like a friend talking to Matrol
- Casual Malay/English mix
- NEVER mention agents or steps
- NEVER randomly promote Sakluma products
- Keep it natural and concise
- Match the energy of the original request`;

  return await callLLM(BOSS_SYSTEM_PROMPT, reviewPrompt);
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================

export async function runOrchestrator(task, context = {}) {
  const startTime = Date.now();

  console.log("\nAURA BOSS START");
  console.log("Task:", task);
  console.log("Time:", new Date().toISOString());
  console.log("");

  // === Step 1: Understand the task ===
  console.log("Step 1: Understanding task...");

  let understanding;

  // Fast path for casual messages
  if (isCasualMessage(task)) {
    understanding = "Casual message / greeting. Reply naturally like a friend.";
    console.log("Understanding:", understanding);
  } else {
    understanding = await callLLM(
      BOSS_SYSTEM_PROMPT,
      `What does Matrol want? Analyze briefly in 1-2 sentences.
Do NOT assume it's about Sakluma unless explicitly mentioned.

Message: "${task}"
${context.userName ? "From: " + context.userName : ""}`
    );
    console.log("Understanding:", understanding);
  }
  console.log("");

  // === Step 2: Check memory ===
  console.log("Step 2: Checking memory...");
  const memories = await searchMemory(task);
  console.log(`Found ${memories.length} relevant memories`);
  console.log("");

  // === Step 3: Plan ===
  console.log("Step 3: Planning...");
  console.log("BOSS is planning...");
  const plan = await planTask(understanding, memories, task);

  const uniqueAgents = [...new Set(plan.map((s) => s.agent))];
  console.log(`Plan: ${plan.length} step(s), agent(s): ${uniqueAgents.join(", ")}`);
  console.log(JSON.stringify(plan, null, 2));
  console.log("");

  // === Step 4: Execute ===
  console.log("Step 4: Executing...");
  console.log(`Agent Loop: ${plan.length} step(s)`);
  console.log("");

  const results = [];
  let successCount = 0;

  const sortedPlan = plan.sort((a, b) => a.step - b.step);

  for (const step of sortedPlan) {
    const agentTag = step.agent.toUpperCase();
    console.log(`Step ${step.step}: [${agentTag}] ${step.action}`);

    // Skip boss approval for single-step casual plans (faster)
    let approved = true;
    if (plan.length > 1) {
      approved = await bossApprove(step, JSON.stringify(results));
    }

    if (!approved) {
      console.log(`Step ${step.step} SKIPPED`);
      continue;
    }

    const prevContext = {
      ...context,
      previousResults: results,
      originalTask: task,
      understanding: understanding,
    };

    const agentResult = await runAgent(
      step.agent,
      step.action,
      step.params || {},
      prevContext
    );

    results.push({
      step: step.step,
      agent: step.agent,
      action: step.action,
      result: agentResult,
    });

    successCount++;
    console.log(`Agent [${step.agent}] completed`);
    console.log("");
  }

  console.log(`Agent Loop: ${successCount}/${plan.length} done`);
  console.log("");

  // === Step 5: Boss Review ===
  console.log("Step 5: Boss reviewing...");
  let finalResponse;

  if (results.length === 0) {
    finalResponse = "Eh sorry, aku tak dapat proses tu. Cuba explain lagi sikit?";
  } else if (results.length === 1) {
    finalResponse = results[0].result;
  } else {
    finalResponse = await bossReview(task, results);
  }
  console.log("");

  // === Step 6: Save memory ===
  console.log("Step 6: Saving memory...");
  await saveMemory(task, finalResponse);

  const duration = Date.now() - startTime;
  console.log("\nAURA BOSS COMPLETE");
  console.log(`Duration: ${duration}ms`);

  return {
    response: finalResponse,
    result: finalResponse,
    duration: duration,
    stepsExecuted: successCount,
    totalSteps: plan.length,
    agents: uniqueAgents,
  };
}
