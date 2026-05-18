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
