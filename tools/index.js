// ============================================================
// AURA v4.1 — tools/index.js (PATCHED MEMORY KEY)
// Only change: prefer SUPABASE_SERVICE_ROLE_KEY for server-side writes
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
  if (!_sb) {
    console.warn(
      "[Memory] Supabase client not initialized. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (recommended)."
    );
  }
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
    console.error("[Memory] getConversationHistory:", e.message);
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
    console.error("[Memory] getMonthlyRecall:", e.message);
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
    if (r.data) r.data.forEach(function (x) {
      p[x.pref_key] = x.pref_value;
    });
    return p;
  } catch (e) {
    console.error("[Memory] getPreferences:", e.message);
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
    console.error("[Memory] queryKnowledge:", e.message);
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

// NOTE:
// The rest of your existing exports (telegram/supabase/airtable/gdrive/openRouter/tools map)
// should remain as in your current tools/index.js.
