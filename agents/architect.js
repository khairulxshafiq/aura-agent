import { askLLM } from "../llm.js";
import { supabaseQuery } from "../tools/supabase.js";

export async function architectAgent(step) {
  const { action, params = {} } = step;
  console.log(`Architect Agent: ${action}`);

  switch (action) {
    case "system_review": {
      const memory = await supabaseQuery("aura_memory", { order: "created_at", limit: 20 });
      const review = await askLLM(`
        You are AURA's System Architect. Review system performance:
        Recent tasks: ${JSON.stringify(memory)}
        Analyze: common task types, success rate, bottlenecks, recommendations.
      `, { maxTokens: 800 });
      return { review };
    }

    case "suggest_upgrade": {
      const suggestion = await askLLM(`
        Suggest upgrades for AURA:
        Stack: Railway + OpenRouter + Supabase + n8n + Replicate + Telegram
        Agents: Finance, Sales, Content, Marketing, Training, Ops, Architect
        Area: ${params.area || "general"}
        Budget: ${params.budget || "minimal"}
      `, { maxTokens: 800 });
      return { suggestion };
    }

    case "debug_issue": {
      const diagnosis = await askLLM(`
        Debug this issue:
        Error: ${params.error || "N/A"}
        Context: ${params.context || "N/A"}
        Stack: Node.js + Express + Supabase + OpenRouter
        Provide: root cause, fix steps, prevention.
      `, { maxTokens: 600 });
      return { diagnosis };
    }

    case "code_review": {
      const review = await askLLM(`
        Review this code/architecture:
        ${params.code || params.description || "N/A"}
        Check: bugs, performance, security, best practices.
      `, { maxTokens: 800 });
      return { review };
    }

    case "new_agent_design": {
      const design = await askLLM(`
        Design a new agent for AURA:
        Name: ${params.name || "N/A"}
        Purpose: ${params.purpose || "N/A"}
        Include: responsibilities, actions, tools needed, integration points.
      `, { maxTokens: 800 });
      return { design };
    }

    case "health_check": {
      const health = {
        server: "running",
        agents: ["finance", "sales", "content", "marketing", "training", "ops", "architect"],
        agentCount: 7,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      };
      return { health };
    }

    default: {
      const response = await askLLM(
        `You are a system architect. Handle: ${action}. Details: ${JSON.stringify(params)}`,
        { maxTokens: 600 }
      );
      return { response };
    }
  }
}
