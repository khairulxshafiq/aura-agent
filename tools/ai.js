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
      console.error("[Tool] LLM error:", data.error.message || data.error);
      return null;
    }
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("[Tool] LLM failed:", err.message);
    return null;
  }
}

// === Web Search (Tavily) ===
export async function webSearch(query) {
  if (!TAVILY_API_KEY) {
    console.log("[Tool] Tavily not configured");
    return { error: "Tavily not configured", results: [] };
  }

  try {
    console.log("[Tool] webSearch:", query);
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
    console.log("[Tool] webSearch:", data.results?.length || 0, "results");

    return {
      answer: data.answer || "",
      results: (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.substring(0, 200),
      })),
    };
  } catch (err) {
    console.error("[Tool] webSearch failed:", err.message);
    return { error: err.message, results: [] };
  }
}

// === Deep Research (Gemini via OpenRouter) ===
export async function research(prompt) {
  console.log("[Tool] research:", prompt.substring(0, 80));

  const sys = `You are a research expert for Malaysian F&B, digital marketing, and business.
Provide factual, data-driven analysis. Include numbers, trends, and actionable insights.
Reply in Malay/English mix. Concise but thorough.`;

  return (await callToolLLM(sys, prompt, "google/gemini-2.0-flash")) || "Research failed.";
}

// === Analyze Image (Gemini Vision) ===
export async function analyzeImage(imageUrl, question) {
  console.log("[Tool] analyzeImage:", imageUrl?.substring(0, 60));

  const prompt = `Analyze this image: ${imageUrl}

${question || "Describe what you see. Extract text. Identify objects, colors, mood, quality."}

Reply in Malay/English mix. Be specific and useful.`;

  return (
    (await callToolLLM(
      "You are a visual analysis expert for content creation and brand review.",
      prompt,
      "google/gemini-2.0-flash"
    )) || "Image analysis failed."
  );
}

// === Write Content (Pro Copywriter) ===
export async function writeContent(brief, style, platform) {
  console.log("[Tool] writeContent:", platform || "general", "|", style || "casual");

  const styles = {
    sakluma: "Write for Sakluma Original — premium Malaysian smoked meat. Dark, moody, premium. Mix BM/BI. Storytelling.",
    casual: "Write casually — Manglish, fun, relatable. Like a friend.",
    corporate: "Write professionally — formal, structured, polished.",
    affiliate: "Write with sales angle — urgency, benefits, social proof, CTA.",
    manglish: "Full Manglish — Malaysian English/Malay mix. Very casual, very local.",
  };

  const platforms = {
    instagram: "Hook first line, body 2-3 paragraphs, CTA, 15-20 hashtags.",
    tiktok: "Very short punchy. Max 2-3 lines. Trending hashtags.",
    facebook: "Storytelling, longer OK. Emotional, shareable. 3-5 hashtags.",
    twitter: "Max 280 chars. Punchy, witty. 2-3 hashtags.",
    threads: "Conversational, opinion-based. Casual tone.",
    blog: "SEO-friendly, H2/H3 headings. Intro, body, conclusion.",
  };

  const sys = `You are a top Malaysian content writer.

STYLE: ${styles[style] || styles.casual}
PLATFORM: ${platforms[platform] || "General."}

Write directly, ready to copy-paste. Include hashtags if needed.`;

  return (await callToolLLM(sys, `Write content for: ${brief}`)) || "Content writing failed.";
}

// === Quick Caption Generator ===
export async function generateCaption(topic, platform, mood) {
  console.log("[Tool] generateCaption:", topic, "|", platform || "instagram");

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
