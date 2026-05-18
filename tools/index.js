// ============================================================
// AURA v4.1 — tools/index.js (FULL: Memory + All Re-exports)
// ============================================================

import { createClient } from "@supabase/supabase-js";

// ── Memory (embedded) ─────────────────────────────────────
var _sbUrl = process.env.SUPABASE_URL;
var _sbKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY;

var _sb = null;
function _getDb() {
  if (!_sb && _sbUrl && _sbKey) _sb = createClient(_sbUrl, _sbKey);
  return _sb;
}
function _month() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

export async function saveConversation(chatId, role, message) {
  var db = _getDb();
  if (!db || !message) return;
  try {
    await db.from("aura_conversations").insert({
      chat_id: String(chatId),
      role,
      message: (message || "").substring(0, 5000),
      month_year: _month(),
    });
  } catch (e) {
    console.error("[Memory] saveConversation:", e.message);
  }
}

export async function getConversationHistory(chatId, limit) {
  var db = _getDb();
  if (!db) return [];
  try {
    var r = await db
      .from("aura_conversations")
      .select("role, message")
      .eq("chat_id", String(chatId))
      .order("created_at", { ascending: false })
      .limit(limit || 10);
    return r.data
      ? r.data.reverse().map(function (x) {
          return { role: x.role, content: x.message };
        })
      : [];
  } catch (e) {
    return [];
  }
}

export async function getMonthlyRecall(chatId, monthYear) {
  var db = _getDb();
  if (!db) return [];
  try {
    var r = await db
      .from("aura_conversations")
      .select("role, message, created_at")
      .eq("chat_id", String(chatId))
      .eq("month_year", monthYear || _month())
      .eq("role", "user")
      .order("created_at", { ascending: true })
      .limit(50);
    return r.data || [];
  } catch (e) {
    return [];
  }
}

export async function savePreference(chatId, key, value, learnedFrom) {
  var db = _getDb();
  if (!db) return;
  try {
    await db.from("aura_preferences").upsert(
      {
        chat_id: String(chatId),
        pref_key: key,
        pref_value: value,
        learned_from: (learnedFrom || "").substring(0, 500),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "chat_id,pref_key" }
    );
  } catch (e) {
    console.error("[Memory] savePreference:", e.message);
  }
}

export async function getPreferences(chatId) {
  var db = _getDb();
  if (!db) return {};
  try {
    var r = await db
      .from("aura_preferences")
      .select("pref_key, pref_value")
      .eq("chat_id", String(chatId));
    var p = {};
    if (r.data)
      r.data.forEach(function (x) {
        p[x.pref_key] = x.pref_value;
      });
    return p;
  } catch (e) {
    return {};
  }
}

export function detectFeedback(message) {
  var msg = (message || "").toLowerCase();
  var f = [];
  if (msg.includes("terlalu panjang") || msg.includes("pendekkan"))
    f.push({ key: "content_length", value: "shorter" });
  if (msg.includes("lagi detail") || msg.includes("panjangkan"))
    f.push({ key: "content_length", value: "longer" });
  if (msg.includes("cringe") || msg.includes("macam ai"))
    f.push({ key: "tone", value: "more_natural" });
  if (msg.includes("tak nak emoji"))
    f.push({ key: "emoji_usage", value: "minimal" });
  if (msg.includes("cun") || msg.includes("perfect") || msg.includes("nice"))
    f.push({ key: "last_positive", value: "approved" });
  return f;
}

export async function saveKnowledge(category, title, content, source) {
  var db = _getDb();
  if (!db) return;
  try {
    await db.from("aura_knowledge").insert({
      category,
      title,
      content: (content || "").substring(0, 5000),
      source,
    });
  } catch (e) {
    console.error("[Memory] saveKnowledge:", e.message);
  }
}

export async function queryKnowledge(searchTerm, category) {
  var db = _getDb();
  if (!db) return [];
  try {
    var q = db.from("aura_knowledge").select("*");
    if (category) q = q.eq("category", category);
    var r = await q.ilike("title", "%" + searchTerm + "%").limit(5);
    return r.data || [];
  } catch (e) {
    return [];
  }
}

export async function buildContext(chatId) {
  var history = await getConversationHistory(chatId, 8);
  var prefs = await getPreferences(chatId);
  var prefString = "";
  if (Object.keys(prefs).length > 0) {
    prefString = "\n\nUSER PREFERENCES:\n";
    for (var k in prefs) prefString += "- " + k + ": " + prefs[k] + "\n";
  }
  return { history, preferences: prefs, prefString };
}

// ── Telegram ──────────────────────────────────────────────
export {
  sendTelegram,
  sendTelegramImage,
  sendTelegramBase64Image,
  sendSmartResponse,
  sendTelegramTyping,
  getTelegramFile,
} from "./telegram.js";

// ── Supabase ──────────────────────────────────────────────
export {
  supabaseQuery,
  supabaseInsert,
  supabaseSearch,
  searchMemory,
  saveMemory,
  logActivity,
} from "./supabase.js";

// ── n8n ───────────────────────────────────────────────────
export { triggerN8n } from "./n8n.js";

// ── AI tools ──────────────────────────────────────────────
export {
  callToolLLM,
  webSearch,
  research,
  analyzeImage,
  writeContent,
  generateCaption,
} from "./ai.js";

// ── Airtable ──────────────────────────────────────────────
export {
  airtableCreate,
  airtableUpdate,
  airtableFindByFormula,
  airtableGet,
} from "./airtable.js";

// ── GDrive ────────────────────────────────────────────────
export {
  uploadImageToGDrive,
  downloadAndUploadToGDrive,
} from "./gdrive.js";

// ── OpenRouter (ALL via default import) ───────────────────
import _or from "./openRouter.js";
export var generateImage = _or.generateImage;
export var chatCompletion = _or.chatCompletion;
export var firecrawlSearch = _or.firecrawlSearch;
export var openRouterAnalyzeImage = _or.openRouterAnalyzeImage;
export var getCostReport = _or.getCostReport;
export var shouldUseFreeModel = _or.shouldUseFreeModel;
export var getCredits = _or.getCredits;
export var getUsageStats = _or.getUsageStats;

// ── Tool Map ──────────────────────────────────────────────
import {
  webSearch as _ws,
  research as _rs,
  analyzeImage as _ai,
  writeContent as _wc,
  generateCaption as _gc,
} from "./ai.js";
import {
  airtableCreate as _ac,
  airtableUpdate as _au,
  airtableFindByFormula as _af,
  airtableGet as _ag,
} from "./airtable.js";
import {
  uploadImageToGDrive as _ug,
  downloadAndUploadToGDrive as _dg,
} from "./gdrive.js";

export var TOOLS = {
  webSearch: _ws,
  research: _rs,
  generateImage: _or.generateImage,
  analyzeImage: _ai,
  writeContent: _wc,
  generateCaption: _gc,
  airtableCreate: _ac,
  airtableUpdate: _au,
  airtableFindByFormula: _af,
  airtableGet: _ag,
  uploadImageToGDrive: _ug,
  downloadAndUploadToGDrive: _dg,
};

export var TOOL_DESCRIPTIONS = {
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
  downloadAndUploadToGDrive: "Download + upload to GDrive",
};
