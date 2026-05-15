// tools/openrouter.js

import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function askOpenRouter({
  model,
  prompt,
  system = "You are Aura AI.",
  temperature = 0.7
}) {

  try {

    console.log(`🧠 MODEL SELECTED: ${model}`);

    const completion = await client.chat.completions.create({
      model,
      temperature,
      messages: [
        {
          role: "system",
          content: system
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const response =
      completion.choices?.[0]?.message?.content || "";

    console.log("✅ OpenRouter response received");

    return response;

  } catch (error) {

    console.error("❌ OpenRouter Error:", error);

    return `
OpenRouter request failed.

Possible causes:
- Invalid model
- API issue
- Rate limit
- Invalid API key
`;
  }
}
