import { askLLM } from "../llm.js";

var CODING_SYSTEM = "You are AURA Coding Agent. " +
  "Expert in Node.js, Railway, Supabase, OpenRouter, Telegram bots, API integration, Python, JavaScript. " +
  "Analyze carefully, identify root cause, propose production-ready fix. " +
  "Reply in casual Malay/English. Be specific and actionable. " +
  "Include code examples when relevant. NEVER return raw JSON as final answer.";

export async function codingAgent(step) {
  var action = step.action || "general";
  var params = step.params || {};
  console.log("Coding Agent: " + action);

  switch (action) {

    case "debug_issue": {
      var diagnosis = await askLLM(
        "Debug this issue carefully:\n" +
        "Error: " + (params.error || "N/A") + "\n" +
        "Context: " + (params.context || "N/A") + "\n" +
        "Stack: Node.js + Express + Supabase + OpenRouter + Railway\n" +
        "Provide: root cause, fix steps with code, prevention tips.",
        { maxTokens: 800, systemPrompt: CODING_SYSTEM }
      );
      return { diagnosis: diagnosis };
    }

    case "analyze_logs": {
      var analysis = await askLLM(
        "Analyze these logs and identify issues:\n" +
        (params.logs || params.task || "No logs provided") + "\n" +
        "Identify: errors, warnings, root cause, suggested fix.",
        { maxTokens: 800, systemPrompt: CODING_SYSTEM }
      );
      return { analysis: analysis };
    }

    case "generate_code": {
      var code = await askLLM(
        "Generate production-ready code for:\n" +
        (params.task || params.description || "N/A") + "\n" +
        "Language: " + (params.language || "JavaScript/Node.js") + "\n" +
        "Requirements: clean, modular, commented, secure, no hardcoded secrets.",
        { maxTokens: 1000, systemPrompt: CODING_SYSTEM }
      );
      return { code: code };
    }

    case "code_review": {
      var review = await askLLM(
        "Review this code/architecture:\n" +
        (params.code || params.description || "N/A") + "\n" +
        "Check: bugs, performance, security, best practices. Suggest improvements.",
        { maxTokens: 800, systemPrompt: CODING_SYSTEM }
      );
      return { review: review };
    }

    case "explain_error": {
      var explanation = await askLLM(
        "Explain this error in simple terms:\n" +
        (params.error || params.task || "N/A") + "\n" +
        "Explain: what happened, why, how to fix, how to prevent.",
        { maxTokens: 600, systemPrompt: CODING_SYSTEM }
      );
      return { explanation: explanation };
    }

    default: {
      var response = await askLLM(
        "You are a coding expert. Handle this task:\n" +
        action + "\n" +
        "Details: " + JSON.stringify(params) + "\n" +
        "Provide clear, actionable, production-ready response.",
        { maxTokens: 800, systemPrompt: CODING_SYSTEM }
      );
      return { response: response };
    }
  }
}
