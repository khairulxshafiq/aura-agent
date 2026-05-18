// ============================================================
// AURA v4.1 — Tools Barrel File
// ============================================================

export { sendTelegram, sendTelegramImage, sendTelegramBase64Image, sendSmartResponse, sendTelegramTyping, getTelegramFile } from "./telegram.js";
export { generateImage } from "./openRouter.js";
export { chatCompletion, firecrawlSearch, openRouterAnalyzeImage, getCostReport, shouldUseFreeModel, getCredits, getUsageStats } from "./openRouter.js";
export { supabaseQuery, supabaseInsert, supabaseSearch, searchMemory, saveMemory, logActivity } from "./supabase.js";
export { triggerN8n } from "./n8n.js";
export { callToolLLM, webSearch, research, analyzeImage, writeContent, generateCaption } from "./ai.js";
export { airtableCreate, airtableUpdate, airtableFindByFormula, airtableGet } from "./airtable.js";
export { uploadImageToGDrive, downloadAndUploadToGDrive, listGDriveFiles, deleteGDriveFile } from "./gdrive.js";
export { saveConversation, getConversationHistory, getPreferences, savePreference, detectFeedback, buildContext, saveKnowledge, queryKnowledge, getMonthlyRecall } from "./memory.js";

import { webSearch, research, analyzeImage, writeContent, generateCaption } from "./ai.js";
import { generateImage } from "./openRouter.js";
import { airtableCreate, airtableUpdate, airtableFindByFormula, airtableGet } from "./airtable.js";
import { uploadImageToGDrive } from "./gdrive.js";

export var TOOLS = {
  webSearch, research, generateImage, analyzeImage, writeContent, generateCaption,
  airtableCreate, airtableUpdate, airtableFindByFormula, airtableGet,
  uploadImageToGDrive
};

export var TOOL_DESCRIPTIONS = {
  webSearch: "Search internet (Firecrawl + Tavily)",
  research: "Deep analysis & reasoning",
  generateImage: "Create AI images (Gemini)",
  analyzeImage: "Analyze images with AI vision",
  writeContent: "Write long-form content",
  generateCaption: "Quick caption + hashtags",
  airtableCreate: "Save draft to Airtable",
  airtableUpdate: "Update Airtable record",
  airtableFindByFormula: "Find Airtable records",
  airtableGet: "Get Airtable record by ID",
  uploadImageToGDrive: "Upload image to Google Drive"
};
