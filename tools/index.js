// ============================================================
// AURA v4.1 — Tools Barrel File
// File: tools/index.js
// ============================================================

// Telegram
export { sendTelegram, sendTelegramImage, sendTelegramBase64Image, sendSmartResponse, sendTelegramTyping, getTelegramFile } from "./telegram.js";

// OpenRouter (image gen keeps backward compat — returns URL string)
export { generateImage } from "./openRouter.js";

// OpenRouter NEW exports (v4.1)
export { chatCompletion, firecrawlSearch, openRouterAnalyzeImage, getCostReport, shouldUseFreeModel, getCredits, getUsageStats } from "./openRouter.js";

// Supabase
export {
  supabaseQuery,
  supabaseInsert,
  supabaseSearch,
  searchMemory,
  saveMemory,
  logActivity,
} from "./supabase.js";

// n8n
export { triggerN8n } from "./n8n.js";

// AI tools (Tavily search, research, etc)
export {
  callToolLLM,
  webSearch,
  research,
  analyzeImage,
  writeContent,
  generateCaption,
} from "./ai.js";

// === Tool Map ===
import { webSearch, research, analyzeImage, writeContent, generateCaption } from "./ai.js";
import { generateImage } from "./openRouter.js";
import { firecrawlSearch } from "./openRouter.js";

export var TOOLS = {
  webSearch: webSearch,
  firecrawlSearch: firecrawlSearch,
  research: research,
  generateImage: generateImage,
  analyzeImage: analyzeImage,
  writeContent: writeContent,
  generateCaption: generateCaption
};

export var TOOL_DESCRIPTIONS = {
  webSearch: "Search internet for current info, news, trends (Tavily)",
  firecrawlSearch: "Deep web scrape via Firecrawl (OpenRouter plugin) - full page content",
  research: "Deep AI analysis and research (Gemini)",
  generateImage: "Create AI images via OpenRouter (Gemini Image)",
  analyzeImage: "Analyze/read images - OCR, identify, review (Gemini Vision)",
  writeContent: "Write professional content - articles, copies, scripts",
  generateCaption: "Quick social media caption with hooks + hashtags"
};
