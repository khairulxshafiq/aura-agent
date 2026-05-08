import { askLLM } from "../llm.js";
import { sendTelegram } from "../tools/telegram.js";
import { supabaseInsert, supabaseQuery } from "../tools/supabase.js";
import { triggerN8n } from "../tools/n8n.js";

export async function salesAgent(step) {
  const { action, params = {} } = step;
  console.log(`Sales Agent: ${action}`);

  switch (action) {
    case "reply_customer": {
      const reply = await askLLM(`
        You are a friendly sales rep for ${params.business || "Sakluma Original"}.
        Customer message: "${params.message || "N/A"}"
        Product: ${params.product || "Smoked meat products"}
        Tone: Friendly, professional, Malaysian style
        Language: ${params.language || "Malay"}
        Write a short, warm reply. Include price if asked. Add CTA.
      `, { maxTokens: 300 });
      return { reply };
    }

    case "generate_quotation": {
      const quotation = await askLLM(`
        Generate a professional quotation:
        Customer: ${params.customer || "N/A"}
        Items: ${JSON.stringify(params.items || [])}
        Business: ${params.business || "Sakluma Original"}
        Validity: ${params.validity || "7 days"}
        Currency: MYR
        Include: item list, unit price, quantity, subtotal, total, T&C.
      `, { maxTokens: 600 });
      return { quotation };
    }

    case "follow_up": {
      const followUp = await askLLM(`
        Write a follow-up message for a customer:
        Customer: ${params.customer || "N/A"}
        Last interaction: ${params.lastInteraction || "Enquired about products"}
        Days since: ${params.daysSince || "3"}
        Tone: Warm, not pushy
        Language: ${params.language || "Malay"}
      `, { maxTokens: 200 });
      if (params.sendTelegram) {
        await sendTelegram(`Follow-up draft:\n${followUp}`);
      }
      return { followUp };
    }

    case "crm_update": {
      const record = await supabaseInsert("crm_leads", {
        name: params.customer,
        phone: params.phone,
        product_interest: params.product,
        status: params.status || "new",
        notes: params.notes,
        source: params.source || "direct",
        created_at: new Date().toISOString()
      });
      return { updated: true, record };
    }

    case "sales_report": {
      const leads = await supabaseQuery("crm_leads", { order: "created_at", limit: 50 });
      const report = await askLLM(`
        Generate a sales pipeline report:
        Leads data: ${JSON.stringify(leads)}
        Include: total leads, by status, conversion rate, top products.
      `, { maxTokens: 600 });
      return { report };
    }

    case "auto_reply_shopee": {
      const reply = await askLLM(`
        Generate Shopee auto-reply for:
        Question: "${params.question || "N/A"}"
        Product: ${params.product || "Smoked duck"}
        Style: Short, friendly, Shopee-appropriate
        Language: Malay
      `, { maxTokens: 150 });
      return { reply };
    }

    default: {
      const response = await askLLM(
        `You are a sales expert. Handle: ${action}. Details: ${JSON.stringify(params)}`,
        { maxTokens: 500 }
      );
      return { response };
    }
  }
}
