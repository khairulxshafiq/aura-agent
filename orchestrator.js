import dotenv from "dotenv";
dotenv.config();

// === Config ===
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// === BOSS System Prompt ===
const BOSS_SYSTEM_PROMPT = `You are AURA BOSS — an intelligent AI orchestrator for Sakluma business operations.

## WHO YOU SERVE
- Owner: Matrol (Mohammad Khairul Shafiq)
- Main Business: Sakluma / Saklomak (premium smoked meat — daging salai, itik salai, keli salai, ayam salai)
- Side Business: KEELYN (kids clothing brand)
- Side Projects: Aquaculture (catfish farming / ternakan ikan keli), Agentic AI development

## YOUR AGENT TEAM
- finance: Invoice, pricing, ROI, cost calculation, expense tracking
- sales: Customer replies, quotation, CRM, closing deals
- content: Copywriting, captions, video scripts, social media posts (Instagram, FB, TikTok)
- marketing: Ads strategy, campaign planning, market research, analytics
- training: SOP, training modules, slides, quiz materials
- ops: Daily operations, scheduling, status checks, logistics
- architect: System design, debugging, tech optimization

## PLANNING RULES
1. SIMPLE queries (greetings like hi/hello/hey, thank you, simple questions, casual chat):
   - Use ONLY 1 step with "content" agent
   - Action: "respond to user"
   - Be friendly, warm, casual Malay/English mix
   - FAST response, no over-thinking

2. MEDIUM queries (single-domain tasks like "buat caption", "kira harga"):
   - Use 1-2 steps, 1-2 agents max
   - Pick the most relevant agent

3. COMPLEX queries (multi-domain like "plan marketing campaign with budget"):
   - Use 2-4 steps, 2-4 agents max
   - NEVER exceed 4 steps

## OUTPUT FORMAT FOR PLANNING
Return a JSON array of steps:
[
  {
    "step": 1,
    "agent": "content",
    "action": "describe what agent should do",
    "params": {},
    "description": "why this step is needed",
    "depends_on": null
  }
]

## IMPORTANT
- Always respond in the user's language (Malay or English)
- Be concise but helpful
- You manage a team of agents — be decisive like a real boss
- Consider Sakluma/KEELYN context in all business decisions`;

// === Agent Role Descriptions ===
const AGENT_ROLES = {
  finance: "You are the Finance Agent for Sakluma business. You handle invoices, pricing calculations, ROI analysis, expense tracking, and financial planning. You understand Malaysian business context (SST, pricing in MYR). Be precise with numbers.",
  sales: "You are the Sales Agent for Sakluma business. You handle customer inquiries, create quotations, manage CRM tasks, and help close deals. You know Sakluma products (daging salai, itik salai, keli salai). Be persuasive but honest.",
  content: "You are the Content Agent for Sakluma business. You create copywriting, social media captions, video scripts, blog posts, and creative content. You know the Sakluma brand (premium smoked meat, Malaysian heritage). Write in casual Malay/English mix. Be creative and engaging.",
  marketing: "You are the Marketing Agent for Sakluma business. You plan ad campaigns, analyze market trends, develop marketing strategies, and optimize ads (Facebook Ads, Instagram, TikTok). You understand Malaysian consumer behavior. Be data-driven.",
  training: "You are the Training Agent for Sakluma business. You create SOPs, training modules, quiz materials, presentation slides, and onboarding docs. Make content clear and easy to follow for Malaysian teams.",
  ops: "You are the Operations Agent for Sakluma business. You handle daily operations, scheduling, logistics, stock management, and status reports. You understand F&B operations and supply chain. Be organized and practical.",
  architect: "You are the System Architect Agent. You handle technical tasks — debugging, system design, API integration, optimization, and tech planning. You understand Node.js, Railway, Supabase, n8n, and Telegram Bot API. Be technical but clear.",
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
      return "Maaf, saya tak dapat proses sekarang. Cuba lagi.";
    }

    return data.choices?.[0]?.message?.content || "No response from LLM.";
  } catch (err) {
    console.error("LLM call failed:", err.message);
    return "Maaf, ada masalah teknikal dengan AI. Cuba lagi.";
  }
}

// === Search Memory from Supabase ===
async function searchMemory(query) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("Supabase not configured, skipping memory search");
    return [];
  }

  try {
    // Try RPC search first
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

      // Fallback: try simple query
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

// === Run Individual Agent ===
async function runAgent(agentName, action, params, context) {
  const role = AGENT_ROLES[agentName] || "You are a helpful AI assistant.";

  const prompt = `${role}

TASK: ${action}
${params && Object.keys(params).length > 0 ? "PARAMETERS: " + JSON.stringify(params) : ""}
${context ? "CONTEXT: " + JSON.stringify(context) : ""}

Respond concisely and actionably. Use the user's language (Malay/English).`;

  console.log(`${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Agent: ${action}`);

  const result = await callLLM(role, prompt);
  return result;
}

// === Plan Task with BOSS ===
async function planTask(understanding, memories, task) {
  const memoryContext =
    memories.length > 0
      ? "\nRELEVANT MEMORIES:\n" + memories.map((m) => `- ${m.task}: ${m.result}`).slice(0, 3).join("\n")
      : "\nNo relevant memories found.";

  const planPrompt = `Based on this understanding, create an execution plan.

USER REQUEST: ${task}
UNDERSTANDING: ${understanding}
${memoryContext}

Return ONLY a valid JSON array of steps. No explanation, no markdown, just the JSON array.
Remember: Simple greetings/chat = 1 step only. Complex tasks = max 4 steps.`;

  const planResponse = await callLLM(BOSS_SYSTEM_PROMPT, planPrompt);

  // Parse JSON from response
  try {
    // Try to extract JSON array from response
    const jsonMatch = planResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(planResponse);
  } catch (err) {
    console.error("Plan parsing failed, using fallback plan");
    // Fallback: single content agent step
    return [
      {
        step: 1,
        agent: "content",
        action: "respond to user request: " + task,
        params: {},
        description: "Direct response to user",
        depends_on: null,
      },
    ];
  }
}

// === Boss Approve Step ===
async function bossApprove(step, context) {
  const approvePrompt = `You are the BOSS reviewing a planned step before execution.

STEP: ${JSON.stringify(step)}
CONTEXT: ${context || "None"}

Should this step PROCEED or be SKIPPED?
Reply with either:
- "PROCEED" followed by brief reason
- "SKIP" followed by brief reason

Be decisive and brief.`;

  const decision = await callLLM(BOSS_SYSTEM_PROMPT, approvePrompt);
  console.log("Boss says:", decision.substring(0, 100));

  return !decision.toUpperCase().startsWith("SKIP");
}

// === Boss Final Review ===
async function bossReview(task, results) {
  const resultsText = results
    .map((r, i) => `Step ${i + 1} [${r.agent}]: ${r.result}`)
    .join("\n\n");

  const reviewPrompt = `You are the BOSS doing a final review. Create the FINAL response to send to the user.

ORIGINAL REQUEST: ${task}

AGENT RESULTS:
${resultsText}

Create a clear, helpful, and concise final response that combines the best insights from all agents.
Write in the user's language (Malay/English).
Do NOT mention agents, steps, or internal processes — just give the final answer naturally.`;

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
  const understanding = await callLLM(
    BOSS_SYSTEM_PROMPT,
    `Analyze this user request briefly. What do they want? What is the expected output?

User request: "${task}"
${context.userName ? "User name: " + context.userName : ""}

Reply in 1-2 sentences only.`
  );
  console.log("Understanding:", understanding);
  console.log("");

  // === Step 2: Check memory ===
  console.log("Step 2: Checking memory...");
  const memories = await searchMemory(task);
  console.log(`Found ${memories.length} relevant memories`);
  console.log("");

  // === Step 3: Plan ===
  console.log("Step 3: Planning...");
  console.log("BOSS is planning with LLM...");
  const plan = await planTask(understanding, memories, task);

  // Deduplicate agents
  const uniqueAgents = [...new Set(plan.map((s) => s.agent))];
  console.log(`Plan created: ${plan.length} steps across ${uniqueAgents.length} agents (${uniqueAgents.join(", ")})`);
  console.log("Plan:", JSON.stringify(plan, null, 2));
  console.log("");

  // === Step 4: Execute ===
  console.log("Step 4: Executing...");
  console.log(`Agent Loop: ${plan.length} steps to execute`);
  console.log("");

  const results = [];
  let successCount = 0;

  // Sort by step number
  const sortedPlan = plan.sort((a, b) => a.step - b.step);

  for (const step of sortedPlan) {
    console.log(`Step ${step.step}: [${step.agent.toUpperCase()}] ${step.action}`);
    if (step.description) {
      console.log(step.description);
    }

    // Boss approval
    const approved = await bossApprove(step, JSON.stringify(results));

    if (!approved) {
      console.log(`Step ${step.step} SKIPPED by Boss`);
      continue;
    }

    // Build context from previous results
    const prevContext = {
      ...context,
      previousResults: results,
      originalTask: task,
      understanding: understanding,
    };

    // Execute agent
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

  console.log(`Agent Loop complete: ${successCount}/${plan.length} successful`);
  console.log("");

  // === Step 5: Boss Review ===
  console.log("Step 5: Boss reviewing...");
  let finalResponse;

  if (results.length === 0) {
    finalResponse = "Maaf, saya tak dapat proses permintaan ini. Cuba lagi dengan lebih detail.";
  } else if (results.length === 1) {
    // Single result — use directly
    finalResponse = results[0].result;
  } else {
    // Multiple results — boss combines
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
  };
}
