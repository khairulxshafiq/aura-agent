import axios from "axios";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// === Call LLM via OpenRouter ===
export async function callToolLLM(systemPrompt, userMessage, model) {
  try {
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: model || OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
      }
    );

    const data = resp.data;
    if (data.error) {
      console.error("[AI] LLM error:", data.error.message || data.error);
      return null;
    }
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("[AI] LLM failed:", err.message);
    return null;
  }
}

// === Helper: Download image and convert to base64 ===
async function downloadImageAsBase64(url) {
  try {
    console.log("[AI] Downloading image for vision...");
    const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
    const buffer = Buffer.from(resp.data);
    const contentType = resp.headers["content-type"] || "image/jpeg";
    const base64 = `data:${contentType};base64,${buffer.toString("base64")}`;
    console.log("[AI] Image downloaded:", Math.round(buffer.length / 1024), "KB");
    return base64;
  } catch (err) {
    console.error("[AI] Image download failed:", err.message);
    return null;
  }
}

// === Analyze Image (Gemini Vision) — FIXED with base64 ===
export async function analyzeImage(imageInput, question) {
  console.log("[AI] analyzeImage called");

  try {
    // Determine the image data
    let imageDataUri;

    if (imageInput && imageInput.startsWith("data:")) {
      // Already base64
      imageDataUri = imageInput;
      console.log("[AI] Using provided base64 image");
    } else if (imageInput && imageInput.startsWith("http")) {
      // URL — download and convert
      console.log("[AI] Downloading image from URL:", imageInput.substring(0, 80));
      imageDataUri = await downloadImageAsBase64(imageInput);
    }

    if (!imageDataUri) {
      console.error("[AI] No valid image data");
      return "Tak dapat access gambar tu. Cuba hantar lagi?";
    }

    const questionText = question || "Describe this image in detail. Extract any visible text (OCR). Identify all objects, products, logos, prices, colors, and mood. Be specific and useful.";

    // Call OpenRouter with multimodal vision format
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-2.0-flash",
        messages: [
          {
            role: "system",
            content: "You are a visual analysis expert. Analyze images thoroughly for content creation, product review, and brand analysis. Reply in Malay/English mix. Be detailed and specific.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: imageDataUri },
              },
              {
                type: "text",
                text: questionText,
              },
            ],
          },
        ],
        temperature: 0.5,
        max_tokens: 2000,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
      }
    );

    const data = resp.data;
    if (data.error) {
      console.error("[AI] Vision error:", data.error.message || data.error);
      return "Image analysis error: " + (data.error.message || "Unknown");
    }

    const result = data.choices?.[0]?.message?.content;
    console.log("[AI] analyzeImage: success");
    return result || "Tak jumpa apa dalam gambar ni.";
  } catch (err) {
    console.error("[AI] analyzeImage failed:", err.message);
    return "Image analysis failed: " + err.message;
  }
}

// === Web Search (Tavily) ===
export async function webSearch(query) {
  if (!TAVILY_API_KEY) {
    console.log("[AI] Tavily not configured");
    return { error: "Tavily not configured", results: [] };
  }

  try {
    console.log("[AI] webSearch:", query);
    const resp = await axios.post(
      "https://api.tavily.com/search",
      {
        query,
        search_depth: "advanced",
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
        include_images: false,
        country: "my",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TAVILY_API_KEY}`,
        },
      }
    );

    const data = resp.data;
    console.log("[AI] webSearch:", data.results?.length || 0, "results");

    return {
      answer: data.answer || "",
      results: (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.substring(0, 200),
      })),
    };
  } catch (err) {
    console.error("[AI] webSearch failed:", err.message);
    return { error: err.message, results: [] };
  }
}

// === Deep Research (Gemini via OpenRouter) ===
export async function research(prompt) {
  console.log("[AI] research:", prompt.substring(0, 80));

  const sys = `You are a research expert for Malaysian F&B, digital marketing, and business.
Provide factual, data-driven analysis. Include numbers, trends, and actionable insights.
Reply in Malay/English mix. Concise but thorough.`;

  return (await callToolLLM(sys, prompt, "google/gemini-2.0-flash")) || "Research failed.";
}

// === Write Content (Pro Copywriter) ===
export async function writeContent(brief, style, platform) {
  console.log("[AI] writeContent:", platform || "general", "|", style || "casual");

  const styles = {
    sakluma: "Premium Malaysian smoked meat brand. Dark, moody, premium. Mix BM/BI. Storytelling.",
    casual: "Casual Manglish. Fun, relatable. Like a friend.",
    corporate: "Professional, formal, structured, polished.",
    affiliate: "Sales angle — urgency, benefits, social proof, CTA.",
    manglish: "Full Manglish — very casual, very local.",
  };

  const platforms = {
    instagram: "Hook first line, body 2-3 paragraphs, CTA, 15-20 hashtags.",
    tiktok: "Very short punchy. Max 2-3 lines. Trending hashtags.",
    facebook: "Storytelling, longer OK. Emotional, shareable. 3-5 hashtags.",
    twitter: "Max 280 chars. Punchy, witty. 2-3 hashtags.",
    threads: "Conversational, opinion-based. Casual tone.",
    blog: "SEO-friendly, H2/H3 headings. Intro, body, conclusion.",
  };

  const sys = `You are a top Malaysian content writer.\nSTYLE: ${styles[style] || styles.casual}\nPLATFORM: ${platforms[platform] || "General."}\nWrite directly, ready to copy-paste. Include hashtags if needed.`;

  return (await callToolLLM(sys, `Write content for: ${brief}`)) || "Content writing failed.";
}

// === Quick Caption Generator ===
export async function generateCaption(topic, platform, mood) {
  console.log("[AI] generateCaption:", topic, "|", platform || "instagram");

  const prompt = `Generate social media caption:
Topic: ${topic}
Platform: ${platform || "Instagram"}
Mood: ${mood || "engaging and premium"}

Format:
HOOK: [first line]
CAPTION: [2-3 paragraphs]
CTA: [call to action]
HASHTAGS: [10-15 hashtags]

Write in Malay/English mix. Make it scroll-stopping.`;

  return (
    (await callToolLLM(
      "You write viral social media captions for Malaysian brands.",
      prompt
    )) || "Caption failed."
  );
}
