export { sendTelegram, sendTelegramImage, sendTelegramTyping, getTelegramFile } from "./telegram.js";
export { generateImage } from "./replicate.js";
export {
  supabaseQuery,
  supabaseInsert,
  supabaseSearch,
  searchMemory,
  saveMemory,
  logActivity,
} from "./supabase.js";
export { triggerN8n } from "./n8n.js";
export {
  callToolLLM,
  webSearch,
  research,
  analyzeImage,
  writeContent,
  generateCaption,
} from "./ai.js";

// === Tool Map (for dynamic calling) ===
import { webSearch, research, analyzeImage, writeContent, generateCaption } from "./ai.js";
import { generateImage } from "./replicate.js";

export const TOOLS = {
  webSearch,
  research,
  generateImage,
  analyzeImage,
  writeContent,
  generateCaption,
};

export const TOOL_DESCRIPTIONS = {
  webSearch: "Search internet for current info, news, trends (Tavily)",
  research: "Deep AI analysis and research (Gemini)",
  generateImage: "Create AI images (Replicate Flux)",
  analyzeImage: "Analyze/read images — OCR, identify, review (Gemini Vision)",
  writeContent: "Write professional content — articles, copies, scripts",
  generateCaption: "Quick social media caption with hooks + hashtags",
};
