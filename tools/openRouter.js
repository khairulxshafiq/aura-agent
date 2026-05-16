// ============================================================
// AURA v4.1 — OpenRouter API Integration
// File: tools/openRouter.js
// ============================================================
// chatCompletion, webSearch (Firecrawl), generateImage,
// analyzeImage, cost tracking, budget protection
// ============================================================

import axios from "axios";
import { MODELS, COST_LIMITS } from "./modelRouter.js";

var OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
var BASE_URL = "https://openrouter.ai/api/v1";

// -- Cost Tracker (in-memory, resets daily + on restart) --
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
// CHAT COMPLETION — supports web search via Firecrawl plugin
// ============================================================

export async function chatCompletion(options) {
  var model = options.model || "google/gemini-2.5-flash";
  var messages = options.messages || [];
  var systemPrompt = options.systemPrompt || null;
  var enableWebSearch = options.enableWebSearch || false;
  var temperature = (options.temperature !== undefined) ? options.temperature : 0.7;
  var maxTokens = options.maxTokens || 4096;
  var tools = options.tools || null;

  if (shouldUseFreeModel() && model !== "google/gemini-2.5-flash") {
    console.log("[Router] Budget limit! Switching to free model.");
    model = "google/gemini-2.5-flash";
  }

  var fullMessages = [];
  if (systemPrompt) { fullMessages.push({ role: "system", content: systemPrompt }); }
  fullMessages = fullMessages.concat(messages);

  var body = { model: model, messages: fullMessages, temperature: temperature, max_tokens: maxTokens };

  if (enableWebSearch) {
    body.plugins = [{
      id: "web",
      max_results: options.searchMaxResults || 5,
      search_context_size: options.searchDepth || "medium"
    }];
  }
  if (tools) { body.tools = tools; }

  try {
    console.log("[OpenRouter] Model: " + model + " | WebSearch: " + enableWebSearch);
    var resp = await axios.post(BASE_URL + "/chat/completions", body, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENROUTER_API_KEY,
        "HTTP-Referer": "https://aura-agentic.ai",
        "X-Title": "Aura Agentic AI"
      },
      timeout: 120000
    });

    var data = resp.data;
    var usage = data.usage || {};
    trackCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0);

    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      var msg = data.choices[0].message;
      return {
        success: true,
        content: msg.content || "",
        role: msg.role || "assistant",
        toolCalls: msg.tool_calls || null,
        model: data.model || model,
        usage: { inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0, totalTokens: usage.total_tokens || 0 },
        cost: costTracker.history.length > 0 ? costTracker.history[costTracker.history.length - 1].cost : 0
      };
    }
    return { success: false, error: "Unexpected response", content: null };
  } catch (err) {
    console.error("[OpenRouter] Error: " + err.message);
    if (err.response) {
      if (err.response.status === 429) { return { success: false, error: "RATE_LIMIT", content: null, suggestFallback: true }; }
      if (err.response.status === 402) { return { success: false, error: "BUDGET_EXCEEDED", content: null }; }
    }
    return { success: false, error: err.message, content: null };
  }
}

// ============================================================
// WEB SEARCH — Firecrawl via OpenRouter plugin
// ============================================================

export async function firecrawlSearch(query, options) {
  if (!options) { options = {}; }
  return await chatCompletion({
    model: options.model || "google/gemini-2.5-flash",
    messages: [{ role: "user", content: query }],
    systemPrompt: "You are a research assistant. Search the web for the given query. Provide a comprehensive summary with key facts and sources. Cite URLs when available.",
    enableWebSearch: true,
    searchMaxResults: options.maxResults || 5,
    searchDepth: options.depth || "high",
    maxTokens: options.maxTokens || 4096,
    temperature: 0.3
  });
}

// ============================================================
// IMAGE GENERATION — enhanced with cost tracking
// ============================================================

export async function generateImage(prompt, options) {
  if (!options) { options = {}; }
  var imageModels = ["google/gemini-3.1-flash-image-preview", "google/gemini-2.5-flash-image"];

  for (var m = 0; m < imageModels.length; m++) {
    try {
      var model = imageModels[m];
      console.log("[Image] Trying: " + model);

      var resp = await axios.post(BASE_URL + "/chat/completions", {
        model: model,
        messages: [{ role: "user", content: "Generate this image. Only output the image, no text explanation needed: " + prompt }],
        modalities: ["image", "text"]
      }, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + OPENROUTER_API_KEY,
          "HTTP-Referer": "https://aura-agentic.ai",
          "X-Title": "Aura Agentic AI"
        },
        timeout: 60000
      });

      var data = resp.data;
      var usage = data.usage || {};
      trackCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0);

      if (data && data.choices && data.choices[0] && data.choices[0].message) {
        var msg = data.choices[0].message;

        // Method 1: images array (official)
        if (msg.images && msg.images.length > 0) {
          var imgObj = msg.images[0];
          if (imgObj.image_url && imgObj.image_url.url) {
            console.log("[Image] SUCCESS via images array");
            return imgObj.image_url.url;
          }
          if (imgObj.imageUrl && imgObj.imageUrl.url) {
            console.log("[Image] SUCCESS via imageUrl");
            return imgObj.imageUrl.url;
          }
        }
        // Method 2: base64 in content
        if (msg.content && msg.content.indexOf("data:image") > -1) {
          var b64match = msg.content.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+\/=]+/);
          if (b64match) {
            console.log("[Image] SUCCESS via base64");
            return b64match[0];
          }
        }
        // Method 3: markdown
        if (msg.content && msg.content.indexOf("![") > -1) {
          var mdMatch = msg.content.match(/!\[.*?\]\((data:image[^)]+)\)/);
          if (mdMatch && mdMatch[1]) {
            console.log("[Image] SUCCESS via markdown");
            return mdMatch[1];
          }
        }
      }
      console.error("[Image] No image found for " + model);
    } catch (err) {
      console.error("[Image] Error (" + imageModels[m] + "): " + err.message);
    }
  }
  console.error("[Image] ALL MODELS FAILED");
  return null;
}

// ============================================================
// IMAGE ANALYSIS — Vision
// ============================================================

export async function openRouterAnalyzeImage(imageUrl, question) {
  return await chatCompletion({
    model: "google/gemini-2.5-flash",
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl } },
        { type: "text", text: question || "Analyze this image in detail." }
      ]
    }],
    maxTokens: 2048,
    temperature: 0.3
  });
}

// ============================================================
// UTILITIES
// ============================================================

export async function getCredits() {
  try {
    var resp = await axios.get(BASE_URL + "/credits", {
      headers: { "Authorization": "Bearer " + OPENROUTER_API_KEY },
      timeout: 10000
    });
    return resp.data;
  } catch (err) { return null; }
}

export async function getUsageStats() {
  try {
    var resp = await axios.get(BASE_URL + "/auth/key", {
      headers: { "Authorization": "Bearer " + OPENROUTER_API_KEY },
      timeout: 10000
    });
    return { credits: resp.data, localStats: getCostReport() };
  } catch (err) { return { credits: null, localStats: getCostReport() }; }
}

export default {
  chatCompletion, firecrawlSearch, generateImage, openRouterAnalyzeImage,
  getCostReport, shouldUseFreeModel, getCredits, getUsageStats
};
