import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function generateImage(prompt) {

  const response = await client.images.generate({
    model: "black-forest-labs/flux-schnell",
    prompt,
    size: "1024x1024"
  });

  return response.data[0].url;
}
