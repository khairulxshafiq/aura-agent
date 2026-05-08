import { askLLM } from "../llm.js";
import { supabaseInsert, supabaseQuery } from "../tools/supabase.js";
import { triggerN8n } from "../tools/n8n.js";

export async function financeAgent(step) {
  const { action, params = {} } = step;
  console.log(`Finance Agent: ${action}`);

  switch (action) {
    case "generate_invoice": {
      const invoice = await askLLM(`
        Generate a professional invoice with these details:
        Customer: ${params.customer || "N/A"}
        Items: ${JSON.stringify(params.items || [])}
        Currency: MYR
        Business: ${params.business || "Sakluma Original"}
        Format: structured invoice with numbering, date, total, payment terms.
      `, { maxTokens: 600 });
      await supabaseInsert("invoices", {
        customer: params.customer,
        content: invoice,
        amount: params.total,
        status: "draft",
        created_at: new Date().toISOString()
      });
      return { invoice, saved: true };
    }

    case "generate_receipt": {
      const receipt = await askLLM(`
        Generate a receipt:
        Customer: ${params.customer || "Walk-in"}
        Items: ${JSON.stringify(params.items || [])}
        Payment method: ${params.paymentMethod || "Online transfer"}
        Business: Sakluma Original
      `, { maxTokens: 400 });
      return { receipt };
    }

    case "calculate_roi": {
      const analysis = await askLLM(`
        Calculate detailed ROI:
        Investment: ${params.investment || "N/A"}
        Revenue per unit: ${params.revenuePerUnit || "N/A"}
        Cost per unit: ${params.costPerUnit || "N/A"}
        Monthly volume: ${params.volume || "N/A"}
        Include: ROI%, breakeven months, monthly profit, yearly projection.
      `, { maxTokens: 600 });
      return { analysis };
    }

    case "track_expense": {
      const record = await supabaseInsert("expenses", {
        category: params.category || "general",
        amount: params.amount,
        description: params.description,
        business: params.business || "sakluma",
        date: new Date().toISOString()
      });
      return { tracked: true, record };
    }

    case "financial_report": {
      const expenses = await supabaseQuery("expenses", { order: "created_at", limit: 50 });
      const report = await askLLM(`
        Generate monthly financial report from this data:
        ${JSON.stringify(expenses)}
        Include: total expenses, by category, trends, recommendations.
      `, { maxTokens: 800 });
      return { report };
    }

    case "pricing_strategy": {
      const strategy = await askLLM(`
        Create pricing strategy for:
        Product: ${params.product || "N/A"}
        Current cost: ${params.cost || "N/A"}
        Market: ${params.market || "Malaysia"}
        Recommend: pricing tiers, margin analysis, bundle options.
      `, { maxTokens: 600 });
      return { strategy };
    }

    default: {
      const response = await askLLM(
        `You are a finance expert. Handle: ${action}. Details: ${JSON.stringify(params)}`,
        { maxTokens: 500 }
      );
      return { response };
    }
  }
}
