import { askLLMJson } from "./llm.js";

export async function planTask(task, context = {}) {
  console.log("BOSS is planning with LLM...");

  const prompt = `
You are AURA Boss. Break down this task and assign to the right agent(s).

TASK: "${task}"

CONTEXT: ${JSON.stringify(context.understanding || "")}
MEMORY: ${JSON.stringify((context.memory || []).slice(0, 3))}

YOUR 7 AGENTS:
1. finance   -> Invoice, resit, ROI calculation, expense tracking, financial reports, pricing strategy
2. sales     -> Reply customer messages, CRM updates, quotation, follow-up, Shopee/WhatsApp auto-reply
3. content   -> Copywriting, captions, video scripts, brand copy, social media posts, product descriptions
4. marketing -> Ad strategy, campaign planning, analytics, market research, competitor analysis, content calendar
5. training  -> Training modules, slides, quiz, SOP documentation, onboarding checklists
6. ops       -> Daily logs, briefing notes, scheduling, task tracking, operational reports, trigger automations
7. architect -> System upgrades, debugging, code review, infrastructure optimization, new agent design, health check

RULES:
- Assign the BEST agent for each step
- One task may need MULTIPLE agents in sequence
- Each step must have clear input/output
- Keep it efficient (minimum steps needed)
- If a step depends on output from a previous step, set depends_on

Return JSON array:
[
  {
    "step": 1,
    "agent": "agent_name",
    "action": "specific_action",
    "params": { "key": "value" },
    "description": "what this step does",
    "depends_on": null
  }
]
`;

  const steps = await askLLMJson(prompt);

  if (Array.isArray(steps)) {
    const agents = [...new Set(steps.map(s => s.agent))];
    console.log(`Plan created: ${steps.length} steps across ${agents.length} agents (${agents.join(", ")})`);
    return steps;
  }

  // Fallback
  console.warn("Using fallback plan");
  return [{
    step: 1,
    agent: "ops",
    action: "handle_general",
    params: { task },
    description: "General task handling",
    depends_on: null
  }];
}
