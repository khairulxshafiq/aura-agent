// ============================================================
// AURA v4.1 — Memory System (Conversations + Preferences + Knowledge)
// File: tools/memory.js (REPLACES old memory/memory.js)
// ============================================================

import { createClient } from "@supabase/supabase-js";

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
var supabase = null;

function getClient() {
  if (!supabase && SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabase;
}

function getMonthYear() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// ============================================================
// CONVERSATIONS — Save & Recall
// ============================================================

export async function saveConversation(chatId, role, message) {
  var db = getClient();
  if (!db || !message) return;
  try {
    await db.from("aura_conversations").insert({
      chat_id: String(chatId),
      role: role,
      message: (message || "").substring(0, 5000),
      month_year: getMonthYear()
    });
  } catch (err) {
    console.error("[Memory] saveConversation error:", err.message);
  }
}

export async function getConversationHistory(chatId, limit) {
  var db = getClient();
  if (!db) return [];
  if (!limit) limit = 10;
  try {
    var resp = await db.from("aura_conversations")
      .select("role, message, created_at")
      .eq("chat_id", String(chatId))
      .order("created_at", { ascending: false })
      .limit(limit);
    if (resp.data) {
      return resp.data.reverse().map(function(r) {
        return { role: r.role, content: r.message };
      });
    }
    return [];
  } catch (err) {
    console.error("[Memory] getHistory error:", err.message);
    return [];
  }
}

export async function getMonthlyRecall(chatId, monthYear) {
  var db = getClient();
  if (!db) return [];
  if (!monthYear) monthYear = getMonthYear();
  try {
    var resp = await db.from("aura_conversations")
      .select("role, message, created_at")
      .eq("chat_id", String(chatId))
      .eq("month_year", monthYear)
      .eq("role", "user")
      .order("created_at", { ascending: true })
      .limit(50);
    return resp.data || [];
  } catch (err) {
    console.error("[Memory] monthlyRecall error:", err.message);
    return [];
  }
}

// ============================================================
// PREFERENCES — Auto-learned from feedback
// ============================================================

export async function savePreference(chatId, key, value, learnedFrom) {
  var db = getClient();
  if (!db) return;
  try {
    await db.from("aura_preferences").upsert({
      chat_id: String(chatId),
      pref_key: key,
      pref_value: value,
      learned_from: (learnedFrom || "").substring(0, 500),
      updated_at: new Date().toISOString()
    }, { onConflict: "chat_id,pref_key" });
    console.log("[Memory] Preference saved: " + key + " = " + value);
  } catch (err) {
    console.error("[Memory] savePreference error:", err.message);
  }
}

export async function getPreferences(chatId) {
  var db = getClient();
  if (!db) return {};
  try {
    var resp = await db.from("aura_preferences")
      .select("pref_key, pref_value")
      .eq("chat_id", String(chatId));
    var prefs = {};
    if (resp.data) {
      resp.data.forEach(function(r) { prefs[r.pref_key] = r.pref_value; });
    }
    return prefs;
  } catch (err) {
    console.error("[Memory] getPreferences error:", err.message);
    return {};
  }
}

// Detect feedback patterns from user message
export function detectFeedback(message) {
  var msg = (message || "").toLowerCase();
  var feedback = [];

  if (msg.includes("terlalu panjang") || msg.includes("too long") || msg.includes("pendekkan")) {
    feedback.push({ key: "content_length", value: "shorter" });
  }
  if (msg.includes("lagi detail") || msg.includes("panjangkan") || msg.includes("more detail")) {
    feedback.push({ key: "content_length", value: "longer" });
  }
  if (msg.includes("cringe") || msg.includes("tak natural") || msg.includes("macam ai")) {
    feedback.push({ key: "tone", value: "more_natural" });
  }
  if (msg.includes("tak nak emoji") || msg.includes("kurang emoji") || msg.includes("no emoji")) {
    feedback.push({ key: "emoji_usage", value: "minimal" });
  }
  if (msg.includes("cun") || msg.includes("perfect") || msg.includes("okay macam ni") || msg.includes("nice")) {
    feedback.push({ key: "last_positive", value: "approved" });
  }
  if (msg.includes("jangan") || msg.includes("taknak") || msg.includes("dont")) {
    feedback.push({ key: "negative_feedback", value: msg.substring(0, 200) });
  }

  return feedback;
}

// ============================================================
// KNOWLEDGE — Facts, decisions, events
// ============================================================

export async function saveKnowledge(category, title, content, source) {
  var db = getClient();
  if (!db) return;
  try {
    await db.from("aura_knowledge").insert({
      category: category,
      title: title,
      content: (content || "").substring(0, 5000),
      source: source
    });
  } catch (err) {
    console.error("[Memory] saveKnowledge error:", err.message);
  }
}

export async function queryKnowledge(searchTerm, category) {
  var db = getClient();
  if (!db) return [];
  try {
    var q = db.from("aura_knowledge").select("*");
    if (category) q = q.eq("category", category);
    q = q.ilike("title", "%" + searchTerm + "%").limit(5);
    var resp = await q;
    return resp.data || [];
  } catch (err) {
    console.error("[Memory] queryKnowledge error:", err.message);
    return [];
  }
}

// ============================================================
// CONTEXT BUILDER — Builds prompt context from memory
// ============================================================

export async function buildContext(chatId, currentMessage) {
  var history = await getConversationHistory(chatId, 8);
  var prefs = await getPreferences(chatId);

  // Build preferences string
  var prefString = "";
  if (Object.keys(prefs).length > 0) {
    prefString = "\n\nUSER PREFERENCES (learned from past feedback):\n";
    for (var k in prefs) {
      prefString += "- " + k + ": " + prefs[k] + "\n";
    }
  }

  return {
    history: history,
    preferences: prefs,
    prefString: prefString
  };
}

export default {
  saveConversation, getConversationHistory, getMonthlyRecall,
  savePreference, getPreferences, detectFeedback,
  saveKnowledge, queryKnowledge, buildContext
};
