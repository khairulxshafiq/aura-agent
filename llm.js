import axios from "axios";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function askLLM(prompt, options = {}) {
  const {
    model = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4-20250514",
    temperature = 0.7,
    maxTokens = 1000,
    systemPrompt = "You are AURA, an AI Boss Orchestrator. You manage 7 specialized agents: Finance, Sales, Content, Marketing, Training, Ops, and Architect. You plan tasks, delegate to the right agent, and ensure quality output. Always be decisive and structured."
  } = options;

  try {
    const response = await axios.post(
      OPENROUTER_URL,
      {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature,
        max_tokens: maxTokens
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aura-agent.up.railway.app",
          "X-Title": "AURA Boss Agent"
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("LLM Error:", err.response?.data || err.message);
    throw new Error("LLM failed: " + err.message);
  }
}

export async function askLLMJson(prompt, options = {}) {
  const raw = await askLLM(prompt, {
    ...options,
    systemPrompt: (options.systemPrompt || "") +
      "\n\nIMPORTANT: Respond ONLY in valid JSON. No markdown wrapping, no explanation outside JSON."
  });

  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    console.warn("Failed to parse JSON, returning raw");
    return { raw };
  }
}
