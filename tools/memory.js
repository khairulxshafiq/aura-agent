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

export async function saveConversation(chatId, role, message) {
  var db = getClient();
  if (!db || !message) return;
  try {
    await db.from("aura_conversations").insert({
      chat_id: String(chatId), role: role,
      message: (message || "").substring(0, 5000),
      month_year: getMonthYear()
    });
  } catch (err) { console.error("[Memory] saveConversation:", err.message); }
}

export async function getConversationHistory(chatId, limit) {
  var db = getClient();
  if (!db) return [];
  try {
    var resp = await db.from("aura_conversations")
      .select("role, message, created_at")
      .eq("chat_id", String(chatId))
      .order("created_at", { ascending: false })
      .limit(limit || 10);
    return resp.data ? resp.data.reverse().map(function(r) { return { role: r.role, content: r.message }; }) : [];
  } catch (err) { return []; }
}

export async function getMonthlyRecall(chatId, monthYear) {
  var db = getClient();
  if (!db) return [];
  try {
    var resp = await db.from("aura_conversations")
      .select("role, message, created_at")
      .eq("chat_id", String(chatId))
      .eq("month_year", monthYear || getMonthYear())
      .eq("role", "user")
      .order("created_at", { ascending: true }).limit(50);
    return resp.data || [];
  } catch (err) { return []; }
}

export async function savePreference(chatId, key, value, learnedFrom) {
  var db = getClient();
  if (!db) return;
  try {
    await db.from("aura_preferences").upsert({
      chat_id: String(chatId), pref_key: key, pref_value: value,
      learned_from: (learnedFrom || "").substring(0, 500),
      updated_at: new Date().toISOString()
    }, { onConflict: "chat_id,pref_key" });
  } catch (err) { console.error("[Memory] savePreference:", err.message); }
}

export async function getPreferences(chatId) {
  var db = getClient();
  if (!db) return {};
  try {
    var resp = await db.from("aura_preferences").select("pref_key, pref_value").eq("chat_id", String(chatId));
    var prefs = {};
    if (resp.data) resp.data.forEach(function(r) { prefs[r.pref_key] = r.pref_value; });
    return prefs;
  } catch (err) { return {}; }
}

export function detectFeedback(message) {
  var msg = (message || "").toLowerCase();
  var feedback = [];
  if (msg.includes("terlalu panjang") || msg.includes("pendekkan")) feedback.push({ key: "content_length", value: "shorter" });
  if (msg.includes("lagi detail") || msg.includes("panjangkan")) feedback.push({ key: "content_length", value: "longer" });
  if (msg.includes("cringe") || msg.includes("macam ai")) feedback.push({ key: "tone", value: "more_natural" });
  if (msg.includes("tak nak emoji") || msg.includes("kurang emoji")) feedback.push({ key: "emoji_usage", value: "minimal" });
  if (msg.includes("cun") || msg.includes("perfect") || msg.includes("nice")) feedback.push({ key: "last_positive", value: "approved" });
  return feedback;
}

export async function saveKnowledge(category, title, content, source) {
  var db = getClient();
  if (!db) return;
  try { await db.from("aura_knowledge").insert({ category, title, content: (content || "").substring(0, 5000), source }); }
  catch (err) { console.error("[Memory] saveKnowledge:", err.message); }
}

export async function queryKnowledge(searchTerm, category) {
  var db = getClient();
  if (!db) return [];
  try {
    var q = db.from("aura_knowledge").select("*");
    if (category) q = q.eq("category", category);
    var resp = await q.ilike("title", "%" + searchTerm + "%").limit(5);
    return resp.data || [];
  } catch (err) { return []; }
}

export async function buildContext(chatId, currentMessage) {
  var history = await getConversationHistory(chatId, 8);
  var prefs = await getPreferences(chatId);
  var prefString = "";
  if (Object.keys(prefs).length > 0) {
    prefString = "\n\nUSER PREFERENCES:\n";
    for (var k in prefs) prefString += "- " + k + ": " + prefs[k] + "\n";
  }
  return { history: history, preferences: prefs, prefString: prefString };
}

export default {
  saveConversation, getConversationHistory, getMonthlyRecall,
  savePreference, getPreferences, detectFeedback,
  saveKnowledge, queryKnowledge, buildContext
};
