// ============================================================
// AURA v4.1 — Tools Barrel File
// File: tools/index.js
// ============================================================

// Telegram
export {
  sendTelegram,
  sendTelegramImage,
  sendTelegramBase64Image,
  sendSmartResponse,
  sendTelegramTyping,
  getTelegramFile
} from "./telegram.js";

// OpenRouter (keep backward compat)
export { generateImage } from "./openRouter.js";

// OpenRouter extra (if your openRouter.js exports these)
export {
  chatCompletion,
  firecrawlSearch,
  openRouterAnalyzeImage,
  getCostReport,
  shouldUseFreeModel,
  getCredits,
  getUsageStats
} from "./openRouter.js";

// Supabase
export {
  supabaseQuery,
  supabaseInsert,
  supabaseSearch,
  searchMemory,
  saveMemory,
  logActivity
} from "./supabase.js";

// n8n
export { triggerN8n } from "./n8n.js";

// AI tools (Tavily search, research, content, vision)
export {
  callToolLLM,
  webSearch,
  research,
  analyzeImage,
  writeContent,
  generateCaption
} from "./ai.js";

// Airtable (NEW)
export {
  airtableCreate,
  airtableUpdate,
  airtableFindByFormula,
  airtableGet
} from "./airtable.js";

// === Tool Map ===
import { webSearch, research, analyzeImage, writeContent, generateCaption } from "./ai.js";
import { generateImage } from "./openRouter.js";
import { airtableCreate, airtableUpdate, airtableFindByFormula, airtableGet } from "./airtable.js";

export const TOOLS = {
  webSearch,
  research,
  generateImage,
  analyzeImage,
  writeContent,
  generateCaption,
  airtableCreate,
  airtableUpdate,
  airtableFindByFormula,
  airtableGet
};

export const TOOL_DESCRIPTIONS = {
  webSearch: "Search internet for current info, news, trends",
  research: "Deep analysis & reasoning",
  generateImage: "Create AI images via OpenRouter (Gemini Image)",
  analyzeImage: "Analyze/read images with AI vision",
  writeContent: "Write long-form content (FB/IG/etc)",
  generateCaption: "Quick caption + hooks + hashtags",
  airtableCreate: "Create Airtable record (content staging)",
  airtableUpdate: "Update Airtable record by recordId",
  airtableFindByFormula: "Find Airtable records by filter formula",
  airtableGet: "Get Airtable record by ID"
};
``
