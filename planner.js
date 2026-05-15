// planner.js

import { askLLMJson } from "./llm.js";

export function detectAgent(message) {

  const lower = message.toLowerCase();

  // CODING
  if (
    lower.includes("error") ||
    lower.includes("bug") ||
    lower.includes("logs") ||
    lower.includes("code") ||
    lower.includes("debug") ||
    lower.includes("railway") ||
    lower.includes("api") ||
    lower.includes("openrouter")
  ) {
    return "coding";
  }

  // RESEARCH
  if (
    lower.includes("research") ||
    lower.includes("trend") ||
    lower.includes("analyze") ||
    lower.includes("market")
  ) {
    return "research";
  }

  // FINANCE
  if (
    lower.includes("invoice") ||
    lower.includes("roi") ||
    lower.includes("pricing") ||
    lower.includes("profit") ||
    lower.includes("expense")
  ) {
    return "finance";
  }

  // CONTENT
  if (
    lower.includes("caption") ||
    lower.includes("copywriting") ||
    lower.includes("post") ||
    lower.includes("content")
  ) {
    return "content";
  }

  // DEFAULT
  return "ops";
}

export async function planTask(task, context = {}) {

  console.log("🧠 AURA BOSS is planning with LLM...");

  const prompt = `
You are AURA Boss.

Your role:
- Analyze the user request
- Choose the BEST agent(s)
- Optimize cost
- Choose cheap models for simple tasks
- Choose expensive models only when needed

TASK:
"${task}"

CONTEXT:
${JSON.stringify(context.understanding || "")}

MEMORY:
${JSON.stringify((context.memory || []).slice(0, 3))}

AVAILABLE AGENTS:

1. coding
- debugging
- logs analysis
- API troubleshooting
- OpenRouter integration
- code generation
- infrastructure diagnosis

2. finance
- ROI
- pricing
- financial reports
- invoices

3. content
- captions
- copywriting
- scripts
- branding

4. marketing
- campaign planning
- competitor analysis
- analytics

5. ops
- task tracking
- operations
- scheduling
- workflow handling

6. research
- trends
- web research
- summaries
- analysis

7. architect
- AI system upgrades
- orchestration
- infrastructure optimization
- autonomous planning

MODEL STRATEGY:

Simple tasks:
- use cheap models

Complex tasks:
- use premium models

Image generation:
- use Flux/Recraft

Coding:
- DeepSeek/Claude

Creative:
- Gemini/GPT-4o

Return JSON array only.

FORMAT:
[
  {
    "step": 1,
    "agent": "coding",
    "action": "analyze_logs",
    "model": "deepseek-chat",
    "reason": "cheap and strong for debugging",
    "params": {
      "task": "analyze railway logs"
    },
    "depends_on": null
  }
]
`;

  try {

    const steps = await askLLMJson(prompt);

    if (Array.isArray(steps)) {

      const agents = [...new Set(steps.map(s => s.agent))];

      console.log(
        `✅ PLAN CREATED: ${steps.length} steps across ${agents.length} agents`
      );

      console.log("🤖 AGENTS:", agents.join(", "));

      return steps;
    }

  } catch (error) {

    console.error("❌ Planner Error:", error);

  }

  // FALLBACK
  console.warn("⚠️ Using fallback plan");

  return [
    {
      step: 1,
      agent: "ops",
      action: "handle_general",
      model: "gemini-flash",
      reason: "fallback handling",
      params: { task },
      depends_on: null
    }
  ];
}
