// tools/imageGen.js

import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function generateImage(prompt) {

  try {

    console.log("🎨 IMAGE GENERATION STARTED");
    console.log("📝 PROMPT:", prompt);

    const response = await client.images.generate({
      model: "black-forest-labs/flux-schnell",
      prompt,
      size: "1024x1024"
    });

    const imageUrl = response?.data?.[0]?.url;

    if (!imageUrl) {

      console.error("❌ No image URL returned");

      return null;
    }

    console.log("✅ IMAGE GENERATED");

    return imageUrl;

  } catch (error) {

    console.error("❌ IMAGE GENERATION ERROR:", error);

    return null;
  }
}
