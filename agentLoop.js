import { financeAgent } from "./agents/finance.js";
import { salesAgent } from "./agents/sales.js";
import { contentAgent } from "./agents/content.js";
import { marketingAgent } from "./agents/marketing.js";
import { trainingAgent } from "./agents/training.js";
import { opsAgent } from "./agents/ops.js";
import { architectAgent } from "./agents/architect.js";
import { askLLM } from "./llm.js";

const AGENTS = {
  finance: financeAgent,
  sales: salesAgent,
  content: contentAgent,
  marketing: marketingAgent,
  training: trainingAgent,
  ops: opsAgent,
  architect: architectAgent
};

export async function runAgentLoop(steps, originalTask) {
  console.log(`Agent Loop: ${steps.length} steps to execute`);

  let results = [];
  let stepOutputs = {};

  for (const step of steps) {
    console.log(`\nStep ${step.step}: [${step.agent?.toUpperCase()}] ${step.action}`);
    console.log(`${step.description}`);

    // THINK - Boss evaluates before executing
    const thinkPrompt = `
You are AURA Boss supervising agent execution.

Original task: "${originalTask}"
Current step: ${JSON.stringify(step)}
Previous results: ${JSON.stringify(results.slice(-3))}

Quick decision (1 line): Should I PROCEED, SKIP, or ADJUST this step? Why?
`;
    const decision = await askLLM(thinkPrompt, { maxTokens: 100 });
    console.log(`Boss says: ${decision.substring(0, 100)}`);

    // Check if Boss wants to skip
    if (decision.toUpperCase().includes("SKIP")) {
      console.log("Boss decided to SKIP this step");
      results.push({
        step: step.step,
        agent: step.agent,
        action: step.action,
        output: { skipped: true, reason: decision },
        status: "skipped"
      });
      continue;
    }

    // ACT - Execute the agent
    const agent = AGENTS[step.agent];
    let output;

    if (agent) {
      try {
        const enrichedStep = { ...step };
        if (step.depends_on && stepOutputs[step.depends_on]) {
          enrichedStep.params = {
            ...enrichedStep.params,
            previousOutput: stepOutputs[step.depends_on]
          };
        }

        output = await agent(enrichedStep);
        console.log(`Agent [${step.agent}] completed`);
      } catch (err) {
        output = { error: err.message };
        console.error(`Agent [${step.agent}] failed:`, err.message);
      }
    } else {
      output = { error: `Agent '${step.agent}' not found` };
      console.error(`Unknown agent: ${step.agent}`);
    }

    // OBSERVE - Record result
    const observation = {
      step: step.step,
      agent: step.agent,
      action: step.action,
      output,
      status: output?.error ? "failed" : "success",
      timestamp: new Date().toISOString()
    };

    results.push(observation);
    stepOutputs[step.step] = output;
  }

  console.log(`\nAgent Loop complete: ${results.filter(r => r.status === "success").length}/${results.length} successful`);
  return results;
}
