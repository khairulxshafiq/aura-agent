// ============================================================
// AURA v4.1 — OpenRouter API Integration (COMPLETE)
// File: tools/openRouter.js
// ============================================================
// chatCompletion, firecrawlSearch, generateImage,
// openRouterAnalyzeImage, cost tracking, budget protection
// ============================================================

import axios from "axios";
import { MODELS, COST_LIMITS } from "./modelRouter.js";

var OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
var FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || "";
var BASE_URL = "https://openrouter.ai/api/v1";

// ============================================================
// COST TRACKER (in-memory, resets daily + on restart)
// ============================================================

var costTracker = {
  dailyTotal: 0,
  requestCount: 0,
  lastReset: new Date().toDateString(),
  history: []
};

function resetDailyIfNeeded() {
  var today = new Date().toDateString();
  if (costTracker.lastReset !== today) {
    console.log("[Cost] Daily reset. Yesterday: $" + costTracker.dailyTotal.toFixed(4));
    costTracker.dailyTotal = 0;
    costTracker.requestCount = 0;
    costTracker.lastReset = today;
  }
}

function trackCost(model, inputTokens, outputTokens) {
  resetDailyIfNeeded();
  var cfg = MODELS[model];
  var cost = 0;
  if (cfg) {
    cost = (inputTokens / 1000000) * cfg.costInput + (outputTokens / 1000000) * cfg.costOutput;
  }
  costTracker.dailyTotal += cost;
  costTracker.requestCount += 1;
  costTracker.history.push({ model: model, cost: cost, tokens: inputTokens + outputTokens, time: new Date().toISOString() });
  if (costTracker.history.length > 100) { costTracker.history.shift(); }
  console.log("[Cost] $" + cost.toFixed(6) + " | Daily: $" + costTracker.dailyTotal.toFixed(4) + " | #" + costTracker.requestCount);
  return cost;
}

export function getCostReport() {
  resetDailyIfNeeded();
  var breakdown = {};
  costTracker.history.forEach(function(e) {
    if (!breakdown[e.model]) { breakdown[e.model] = { count: 0, cost: 0 }; }
    breakdown[e.model].count += 1;
    breakdown[e.model].cost += e.cost;
  });
  return {
    dailyTotal: costTracker.dailyTotal,
    requestCount: costTracker.requestCount,
    budget: COST_LIMITS.dailyBudget,
    remaining: COST_LIMITS.dailyBudget - costTracker.dailyTotal,
    modelBreakdown: breakdown,
    lastReset: costTracker.lastReset
  };
}

export function shouldUseFreeModel() {
  resetDailyIfNeeded();
  return costTracker.dailyTotal >= (COST_LIMITS.dailyBudget * 0.8);
}

// ============================================================
// CHAT COMPLETION
// ============================================================

export async function chatCompletion(options) {
  if (!options) options = {};
  var model = options.model || "google/gemini-2.5-flash";
  var messages = options.messages || [];
  var systemPrompt = options.systemPrompt || "";
  var temperature = options.temperature !== undefined ? options.temperature : 0.7;
  var maxTokens = options.maxTokens || 1500;

  try {
    var allMessages = [];
    if (systemPrompt) {
      allMessages.push({ role: "system", content: systemPrompt });
    }
    allMessages = allMessages.concat(messages);

    var resp = await axios.post(BASE_URL + "/chat/completions", {
      model: model,
      messages: allMessages,
      temperature: temperature,
      max_tokens: maxTokens
    }, {
      headers: {
        "Authorization": "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://aura-agent.up.railway.app",
        "X-Title": "AURA v4.1"
      },
      timeout: 60000
    });

    var data = resp.data;
    if (data.error) {
      console.error("[OpenRouter] API error:", data.error.message || data.error);
      return { success: false, content: null, model: model, error: data.error.message || "API error" };
    }

    var content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;

    // Track cost
    var usage = data.usage || {};
    trackCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0);

    return { success: true, content: content, model: model, error: null };

  } catch (err) {
    var status = err.response ? err.response.status : 0;
    var errMsg = err.response && err.response.data && err.response.data.error
      ? err.response.data.error.message || err.message
      : err.message;

    console.error("[OpenRouter] chatCompletion failed:", errMsg, "| Status:", status);

    // Rate limit → suggest fallback
    if (status === 429 || status === 529) {
      return { success: false, content: null, model: model, error: "RATE_LIMIT", suggestFallback: true };
    }

    return { success: false, content: null, model: model, error: errMsg, suggestFallback: status >= 500 };
  }
}

// ============================================================
// IMAGE GENERATION (Gemini native image models)
// ============================================================

export async function generateImage(prompt, options) {
  if (!options) options = {};
  var width = options.width || 1024;
  var height = options.height || 1024;

  var imageModels = [
    "google/gemini-2.0-flash-exp:free",
    "google/gemini-2.5-flash-image"
  ];

  for (var m = 0; m < imageModels.length; m++) {
    try {
      console.log("[OpenRouter] generateImage with:", imageModels[m]);

      var resp = await axios.post(BASE_URL + "/chat/completions", {
        model: imageModels[m],
        messages: [
          {
            role: "user",
            content: "Generate an image: " + prompt + "\n\nSize: " + width + "x" + height + ". Return ONLY the image, no text."
          }
        ],
        temperature: 0.8,
        max_tokens: 4096
      }, {
        headers: {
          "Authorization": "Bearer " + OPENROUTER_API_KEY,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aura-agent.up.railway.app",
          "X-Title": "AURA Image Gen"
        },
        timeout: 120000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });

      var data = resp.data;
      if (data.error) {
        console.error("[OpenRouter] Image error:", data.error.message || data.error);
        continue;
      }

      // Check for inline_data (base64 image) in response
      var choice = data.choices && data.choices[0];
      if (!choice) continue;

      var msg = choice.message;
      if (!msg) continue;

      // Case 1: Content is array with parts (multimodal response)
      if (Array.isArray(msg.content)) {
        for (var p = 0; p < msg.content.length; p++) {
          var part = msg.content[p];
          if (part.type === "image_url" && part.image_url && part.image_url.url) {
            console.log("[OpenRouter] Image generated (image_url)");
            trackCost(imageModels[m], 500, 1000);
            return part.image_url.url;
          }
          if (part.inline_data && part.inline_data.data) {
            var mime = part.inline_data.mime_type || "image/png";
            console.log("[OpenRouter] Image generated (inline_data)");
            trackCost(imageModels[m], 500, 1000);
            return "data:" + mime + ";base64," + part.inline_data.data;
          }
        }
      }

      // Case 2: Content is string with base64
      if (typeof msg.content === "string") {
        var content = msg.content;
        // Check if it's a base64 data URI
        if (content.indexOf("data:image") > -1) {
          console.log("[OpenRouter] Image generated (data URI in text)");
          trackCost(imageModels[m], 500, 1000);
          return content.trim();
        }
        // Check for raw base64 (long string, no spaces)
        if (content.length > 1000 && content.indexOf(" ") === -1) {
          console.log("[OpenRouter] Image generated (raw base64)");
          trackCost(imageModels[m], 500, 1000);
          return "data:image/png;base64," + content.trim();
        }

        // Check for image URL in text
        var urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/i);
        if (urlMatch) {
          console.log("[OpenRouter] Image generated (URL in text)");
          trackCost(imageModels[m], 500, 1000);
          return urlMatch[1];
        }
      }

      console.log("[OpenRouter] Model returned but no image found, trying next model...");

    } catch (err) {
      console.error("[OpenRouter] generateImage error with " + imageModels[m] + ":", err.message);
      if (err.response) {
        console.error("[OpenRouter] Status:", err.response.status);
      }
    }
  }

  console.error("[OpenRouter] All image models failed");
  return null;
}

// ============================================================
// FIRECRAWL SEARCH (web search + scrape)
// ============================================================

export async function firecrawlSearch(query, options) {
  if (!options) options = {};
  var depth = options.depth || "basic";
  var maxResults = options.maxResults || 3;
  var maxTokens = options.maxTokens || 2000;
  var model = options.model || "google/gemini-2.5-flash";

  // Try Firecrawl API first if key exists
  if (FIRECRAWL_API_KEY) {
    try {
      console.log("[Firecrawl] Searching:", query.substring(0, 80));
      var fcResp = await axios.post("https://api.firecrawl.dev/v0/search", {
        query: query,
        pageOptions: { onlyMainContent: true },
        searchOptions: { limit: maxResults }
      }, {
        headers: {
          "Authorization": "Bearer " + FIRECRAWL_API_KEY,
          "Content-Type": "application/json"
        },
        timeout: 30000
      });

      if (fcResp.data && fcResp.data.data && fcResp.data.data.length > 0) {
        var results = fcResp.data.data;
        var combined = results.map(function(r, i) {
          return "Source " + (i + 1) + ": " + (r.metadata && r.metadata.title || "Untitled") + "\nURL: " + (r.metadata && r.metadata.sourceURL || "") + "\n" + (r.content || r.markdown || "").substring(0, 1000);
        }).join("\n\n");

        // Summarize with LLM
        var summary = await chatCompletion({
          model: model,
          messages: [{ role: "user", content: "Berdasarkan hasil carian ini, jawab soalan: \"" + query + "\"\n\n" + combined + "\n\nBalas dalam BM. Ringkas tapi lengkap." }],
          systemPrompt: "Kau pakar ringkasan. Bahasa Malaysia sahaja.",
          maxTokens: maxTokens,
          temperature: 0.5
        });

        if (summary.success) {
          return { success: true, content: summary.content, model: model, source: "firecrawl" };
        }
      }
    } catch (fcErr) {
      console.error("[Firecrawl] Failed:", fcErr.message);
    }
  }

  // Fallback: Use LLM directly with search grounding
  try {
    console.log("[OpenRouter] Search fallback via LLM:", query.substring(0, 80));
    var llmResult = await chatCompletion({
      model: model,
      messages: [{ role: "user", content: query }],
      systemPrompt: "You are a helpful research assistant. Provide accurate, up-to-date information. Reply in the same language as the query.",
      maxTokens: maxTokens,
      temperature: 0.5
    });

    if (llmResult.success) {
      return { success: true, content: llmResult.content, model: model, source: "llm_fallback" };
    }
    return { success: false, content: null, error: llmResult.error, model: model };

  } catch (err) {
    console.error("[OpenRouter] Search fallback failed:", err.message);
    return { success: false, content: null, error: err.message, model: model };
  }
}

// ============================================================
// IMAGE ANALYSIS (Vision)
// ============================================================

export async function openRouterAnalyzeImage(imageInput, question) {
  var visionModels = [
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash",
    "google/gemini-2.5-flash"
  ];

  var questionText = question || "Analyze this image in detail. Extract all visible text, identify objects, brands, colors. Reply in Malay/English mix.";

  // Determine image content format
  var imageContent;
  if (imageInput && imageInput.startsWith("data:")) {
    imageContent = { type: "image_url", image_url: { url: imageInput } };
  } else if (imageInput && imageInput.startsWith("http")) {
    imageContent = { type: "image_url", image_url: { url: imageInput } };
  } else {
    return { success: false, content: "Invalid image input." };
  }

  for (var v = 0; v < visionModels.length; v++) {
    try {
      console.log("[OpenRouter] Vision with:", visionModels[v]);

      var resp = await axios.post(BASE_URL + "/chat/completions", {
        model: visionModels[v],
        messages: [
          {
            role: "user",
            content: [
              imageContent,
              { type: "text", text: questionText }
            ]
          }
        ],
        temperature: 0.5,
        max_tokens: 2000
      }, {
        headers: {
          "Authorization": "Bearer " + OPENROUTER_API_KEY,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aura-agent.up.railway.app",
          "X-Title": "AURA Vision"
        },
        timeout: 60000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });

      var data = resp.data;
      if (data.error) {
        console.error("[OpenRouter] Vision error:", data.error.message || data.error);
        continue;
      }

      var content = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : null;

      if (content) {
        var usage = data.usage || {};
        trackCost(visionModels[v], usage.prompt_tokens || 0, usage.completion_tokens || 0);
        console.log("[OpenRouter] Vision success with:", visionModels[v]);
        return { success: true, content: content, model: visionModels[v] };
      }

    } catch (err) {
      console.error("[OpenRouter] Vision failed with " + visionModels[v] + ":", err.message);
    }
  }

  return { success: false, content: "Semua model vision gagal." };
}

// ============================================================
// GET CREDITS (OpenRouter balance check)
// ============================================================

export async function getCredits() {
  try {
    var resp = await axios.get(BASE_URL + "/credits", {
      headers: {
        "Authorization": "Bearer " + OPENROUTER_API_KEY
      },
      timeout: 10000
    });
    return resp.data;
  } catch (err) {
    console.error("[OpenRouter] getCredits failed:", err.message);
    return { error: err.message };
  }
}

// ============================================================
// GET USAGE STATS
// ============================================================

export function getUsageStats() {
  resetDailyIfNeeded();
  return {
    dailyTotal: costTracker.dailyTotal,
    requestCount: costTracker.requestCount,
    budget: COST_LIMITS.dailyBudget,
    remaining: COST_LIMITS.dailyBudget - costTracker.dailyTotal,
    percentUsed: ((costTracker.dailyTotal / COST_LIMITS.dailyBudget) * 100).toFixed(1) + "%",
    lastReset: costTracker.lastReset,
    recentRequests: costTracker.history.slice(-10)
  };
}

// ============================================================
// DEFAULT EXPORT (for tools/index.js default import)
// ============================================================

export default {
  chatCompletion,
  generateImage,
  firecrawlSearch,
  openRouterAnalyzeImage,
  getCostReport,
  shouldUseFreeModel,
  getCredits,
  getUsageStats
};
