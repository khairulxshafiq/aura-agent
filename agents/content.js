import { askLLM } from "../llm.js";
import { generateImage } from "../tools/replicate.js";

export async function contentAgent(step) {
  const { action, params = {} } = step;
  console.log(`Content Agent: ${action}`);

  switch (action) {
    case "generate_caption": {
      const caption = await askLLM(`
        Write a social media caption:
        Product: ${params.product || "Sakluma smoked duck"}
        Platform: ${params.platform || "Instagram"}
        Style: ${params.style || "Premium, engaging"}
        Language: ${params.language || "Malay"}
        Include relevant emoji. Keep it punchy (2-4 lines).
      `, { maxTokens: 200 });
      return { caption };
    }

    case "generate_image": {
      const imageUrl = await generateImage(
        params.prompt || "Premium food product photography, dark background, golden lighting",
        { width: params.width || 1024, height: params.height || 1024 }
      );
      return { imageUrl };
    }

    case "full_post": {
      const caption = await askLLM(`
        Write Instagram post caption for: ${params.product || "Sakluma"}
        Style: Premium Malaysian brand. Include CTA and hashtags.
        Language: ${params.language || "Malay"}
      `, { maxTokens: 300 });
      const imageUrl = await generateImage(
        params.imagePrompt || `Professional product photo of ${params.product || "smoked duck"}, premium packaging, studio lighting`
      );
      return { caption, imageUrl };
    }

    case "video_script": {
      const script = await askLLM(`
        Write a short video script (30-60 seconds):
        Product: ${params.product || "N/A"}
        Platform: ${params.platform || "TikTok/Reels"}
        Style: ${params.style || "Engaging, trendy"}
        Language: ${params.language || "Malay"}
        Format: [Scene description] + Voiceover/text
      `, { maxTokens: 500 });
      return { script };
    }

    case "brand_copy": {
      const copy = await askLLM(`
        Write brand copy:
        Brand: ${params.brand || "Sakluma Original"}
        Product: ${params.product || "Smoked meat"}
        Tone: ${params.tone || "Premium, authentic, Malaysian"}
        Include: Tagline + description + key selling points
      `, { maxTokens: 400 });
      return { copy };
    }

    case "product_description": {
      const description = await askLLM(`
        Write product description for e-commerce:
        Product: ${params.product || "N/A"}
        Platform: ${params.platform || "Shopee"}
        Features: ${JSON.stringify(params.features || [])}
        Language: ${params.language || "Malay"}
        Include: title, bullet points, description, weight/specs.
      `, { maxTokens: 500 });
      return { description };
    }

    default: {
      const response = await askLLM(
        `You are a content creator expert. Handle: ${action}. Details: ${JSON.stringify(params)}`,
        { maxTokens: 500 }
      );
      return { response };
    }
  }
}
