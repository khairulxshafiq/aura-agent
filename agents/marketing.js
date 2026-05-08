import { askLLM } from "../llm.js";
import { supabaseInsert, supabaseQuery } from "../tools/supabase.js";

export async function marketingAgent(step) {
  const { action, params = {} } = step;
  console.log(`Marketing Agent: ${action}`);

  switch (action) {
    case "ad_strategy": {
      const strategy = await askLLM(`
        Create an advertising strategy:
        Product: ${params.product || "Sakluma smoked products"}
        Budget: ${params.budget || "RM 500/month"}
        Target: ${params.target || "Malaysian food lovers, 25-45"}
        Platforms: ${params.platforms || "Facebook, Instagram, TikTok"}
        Include: campaign structure, ad types, targeting, content calendar, KPIs.
      `, { maxTokens: 800 });
      return { strategy };
    }

    case "campaign_plan": {
      const plan = await askLLM(`
        Design a marketing campaign:
        Campaign name: ${params.name || "N/A"}
        Objective: ${params.objective || "Brand awareness + sales"}
        Duration: ${params.duration || "1 month"}
        Budget: ${params.budget || "RM 500"}
        Product: ${params.product || "N/A"}
        Include: timeline, content plan, channels, expected results.
      `, { maxTokens: 800 });
      return { plan };
    }

    case "competitor_analysis": {
      const analysis = await askLLM(`
        Analyze competitors for:
        Business: ${params.business || "Sakluma Original (smoked meat)"}
        Market: ${params.market || "Malaysia"}
        Include: strengths/weaknesses, pricing comparison, positioning, opportunities.
      `, { maxTokens: 600 });
      return { analysis };
    }

    case "content_calendar": {
      const calendar = await askLLM(`
        Create a 1-week social media content calendar:
        Brand: ${params.brand || "Sakluma Original"}
        Platforms: ${params.platforms || "Instagram, TikTok, WhatsApp Status"}
        Products: ${JSON.stringify(params.products || ["smoked duck", "smoked meat", "smoked chicken"])}
        Format as daily plan with: platform, content type, topic, best posting time.
      `, { maxTokens: 800 });
      return { calendar };
    }

    case "market_research": {
      const research = await askLLM(`
        Conduct market research analysis:
        Industry: ${params.industry || "Premium food / smoked meat"}
        Region: ${params.region || "Malaysia"}
        Focus: ${params.focus || "consumer trends, pricing, demand"}
        Provide data-driven insights and recommendations.
      `, { maxTokens: 800 });
      return { research };
    }

    default: {
      const response = await askLLM(
        `You are a marketing strategist. Handle: ${action}. Details: ${JSON.stringify(params)}`,
        { maxTokens: 600 }
      );
      return { response };
    }
  }
}
