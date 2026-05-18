// ============================================================
// AURA v4.1 — tools/index.js (ROBUST EXPORTS)
// Fix: avoid named import generateImage from openRouter.js
// ============================================================

/* -------------------------
   Telegram
-------------------------- */
export {
  sendTelegram,
  sendTelegramImage,
  sendTelegramBase64Image,
  sendSmartResponse,
  sendTelegramTyping,
  getTelegramFile
} from "./telegram.js";

/* -------------------------
   Supabase (existing memory + activity)
-------------------------- */
export {
  supabaseQuery,
  supabaseInsert,
  supabaseSearch,
  searchMemory,
  saveMemory,
  logActivity
} from "./supabase.js";

/* -------------------------
   AI tools
-------------------------- */
export {
  callToolLLM,
  webSearch,
  research,
  analyzeImage,
  writeContent,
  generateCaption
} from "./ai.js";

/* -------------------------
   Airtable
-------------------------- */
export {
  airtableCreate,
  airtableUpdate,
  airtableFindByFormula,
  airtableGet
} from "./airtable.js";

/* -------------------------
   GDrive
-------------------------- */
export {
  uploadImageToGDrive,
  downloadAndUploadToGDrive
} from "./gdrive.js";

/* -------------------------
   OpenRouter (ROBUST IMPORT)
   IMPORTANT:
   - We import default export and re-export functions safely.
   - This avoids crash if named exports differ on Railway.
-------------------------- */
import openRouterDefault from "./openRouter.js";

// Safe accessors (do not crash if export shape changes)
export const chatCompletion = openRouterDefault?.chatCompletion;
export const firecrawlSearch = openRouterDefault?.firecrawlSearch;
export const openRouterAnalyzeImage = openRouterDefault?.openRouterAnalyzeImage;
export const getCostReport = openRouterDefault?.getCostReport;
export const shouldUseFreeModel = openRouterDefault?.shouldUseFreeModel;
export const getCredits = openRouterDefault?.getCredits;
export const getUsageStats = openRouterDefault?.getUsageStats;

// ✅ The one that crash before
export const generateImage = openRouterDefault?.generateImage;

/* -------------------------
   Optional: hard guard so you see error clearly
-------------------------- */
if (!generateImage) {
  console.warn("[tools/index.js] WARN: generateImage is missing from openRouter default export. Check tools/openRouter.js exports.");
}

/* -------------------------
   Tool Map (for /tool endpoint)
-------------------------- */
import { webSearch, research, analyzeImage, writeContent, generateCaption } from "./ai.js";
import { airtableCreate, airtableUpdate, airtableFindByFormula, airtableGet } from "./airtable.js";
import { uploadImageToGDrive, downloadAndUploadToGDrive } from "./gdrive.js";

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
  airtableGet,
  uploadImageToGDrive,
  downloadAndUploadToGDrive
};

export const TOOL_DESCRIPTIONS = {
  webSearch: "Search internet",
  research: "Deep analysis",
  generateImage: "Create AI images",
  analyzeImage: "Analyze images",
  writeContent: "Write content",
  generateCaption: "Quick caption + hashtags",
  airtableCreate: "Save draft to Airtable",
  airtableUpdate: "Update Airtable record",
  airtableFindByFormula: "Find Airtable records",
  airtableGet: "Get Airtable record",
  uploadImageToGDrive: "Upload image to GDrive",
  downloadAndUploadToGDrive: "Download image + upload to GDrive"
};
``
