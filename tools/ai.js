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
    if (err.response) console.error("[AI] Response:", JSON.stringify(err.response.data).substring(0, 500));
    return null;
  }
}

// === Helper: Download image as base64 ===
async function downloadImageAsBase64(url) {
  try {
    console.log("[AI] Downloading image...");
    const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
    const buffer = Buffer.from(resp.data);
    const contentType = resp.headers["content-type"] || "image/jpeg";
    const base64 = `data:${contentType};base64,${buffer.toString("base64")}`;
    console.log("[AI] Image:", Math.round(buffer.length / 1024), "KB");
    return base64;
  } catch (err) {
    console.error("[AI] Download failed:", err.message);
    return null;
  }
}

// === Helper: Resize base64 if too large ===
function checkImageSize(base64str) {
  // base64 string length in chars (rough size estimate)
  const sizeKB = Math.round(base64str.length / 1024);
  console.log("[AI] Image base64 size:", sizeKB, "KB");
  return sizeKB;
}

// === Call Vision API with retries ===
async function callVisionAPI(imageDataUri, questionText, model) {
  const resp = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: model,
      messages: [
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
      timeout: 60000,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    }
  );
  return resp.data;
}

// === Analyze Image (FIXED: model fallback + error logging) ===
export async function analyzeImage(imageInput, question) {
  console.log("[AI] analyzeImage called");

  try {
    // Get image data
    let imageDataUri;

    if (imageInput && imageInput.startsWith("data:")) {
      imageDataUri = imageInput;
      console.log("[AI] Using provided base64");
    } else if (imageInput && imageInput.startsWith("http")) {
      imageDataUri = await downloadImageAsBase64(imageInput);
    }

    if (!imageDataUri) {
      return "Tak dapat access gambar. Cuba hantar lagi?";
    }

    checkImageSize(imageDataUri);

    const questionText = question ||
      "You are analyzing an image sent by a user. Describe everything you see in detail. " +
      "Extract all visible text (OCR). Identify products, brands, prices, logos, objects, colors. " +
      "Reply in Malay/English mix. Be specific and useful.";

    // Try models in order of reliability for vision
    const visionModels = [
      "openai/gpt-4o-mini",
      "google/gemini-2.0-flash",
      "google/gemini-2.5-flash",
    ];

    for (const model of visionModels) {
      try {
        console.log("[AI] Trying vision model:", model);
        const data = await callVisionAPI(imageDataUri, questionText, model);

        if (data.error) {
          console.error("[AI] Vision error with", model, ":", data.error.message || JSON.stringify(data.error));
          continue;
        }

        const result = data.choices?.[0]?.message?.content;
        if (result) {
          console.log("[AI] analyzeImage SUCCESS with", model);
          return result;
        }
      } catch (err) {
        console.error("[AI] Vision failed with", model, ":", err.message);
        if (err.response) {
          console.error("[AI] Status:", err.response.status);
          console.error("[AI] Error body:", JSON.stringify(err.response.data).substring(0, 500));
        }
        // Continue to next model
      }
    }

    return "Semua model vision gagal analyze gambar ni. Cuba hantar gambar yang lebih kecil?";
  } catch (err) {
    console.error("[AI] analyzeImage error:", err.message);
    return "Image analysis failed: " + err.message;
  }
}

// === Web Search (Tavily) ===
export async function webSearch(query) {
  if (!TAVILY_API_KEY) return { error: "Tavily not configured", results: [] };

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

    return {
      answer: resp.data.answer || "",
      results: (resp.data.results || []).map((r) => ({
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

// === Deep Research (Gemini) ===
export async function research(prompt) {
  console.log("[AI] research:", prompt.substring(0, 80));
  const sys = `You are a research expert for Malaysian F&B, digital marketing, and business.
Provide factual, data-driven analysis. Reply in Malay/English mix.`;
  return (await callToolLLM(sys, prompt, "google/gemini-2.0-flash")) || "Research failed.";
}

// === Write Content ===
export async function writeContent(brief, style, platform) {
  console.log("[AI] writeContent:", platform || "general", "|", style || "casual");

  const styles = {
    sakluma: "Premium Malaysian smoked meat brand. Dark, moody. Mix BM/BI. Storytelling.",
    casual: "Casual Manglish. Fun, relatable.",
    corporate: "Professional, formal, structured.",
    affiliate: "Sales angle — urgency, benefits, CTA.",
    manglish: "Full Manglish — very casual, very local.",
  };

  const platforms = {
    instagram: "Hook first line, body 2-3 para, CTA, 15-20 hashtags.",
    tiktok: "Very short. Max 2-3 lines. Trending hashtags.",
    facebook: "Storytelling. Emotional, shareable. 3-5 hashtags.",
    twitter: "Max 280 chars. Punchy. 2-3 hashtags.",
    threads: "Conversational. Casual tone.",
    blog: "SEO, H2/H3 headings. Intro, body, conclusion.",
  };

  const sys = `You are a top Malaysian content writer.
STYLE: ${styles[style] || styles.casual}
PLATFORM: ${platforms[platform] || "General."}
Write directly, ready to copy-paste.`;

  return (await callToolLLM(sys, `Write content for: ${brief}`)) || "Content writing failed.";
}

// === Quick Caption ===
export async function generateCaption(topic, platform, mood) {
  console.log("[AI] generateCaption:", topic);

  const prompt = `Generate social media caption:
Topic: ${topic}
Platform: ${platform || "Instagram"}
Mood: ${mood || "engaging"}

Format: HOOK, CAPTION, CTA, HASHTAGS
Write in Malay/English mix. Scroll-stopping.`;

  return (await callToolLLM("You write viral captions for Malaysian brands.", prompt)) || "Caption failed.";
}
