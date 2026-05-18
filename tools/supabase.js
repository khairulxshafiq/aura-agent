// ============================================================
// AURA v4.1 — tools/supabase.js (FIXED)
// ============================================================

import { createClient } from "@supabase/supabase-js";

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY;

var _client = null;

function getClient() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("[Supabase] Missing URL or KEY.");
    return null;
  }
  _client = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _client;
}

// === Legacy helpers ===

export async function supabaseQuery(table, options) {
  if (!options) options = {};
  var supabase = getClient();
  if (!supabase) return [];
  try {
    var query = supabase.from(table).select("*");
    if (options.order) query = query.order(options.order, { ascending: false });
    if (options.limit) query = query.limit(options.limit);
    if (options.filter) {
      for (var k in options.filter) {
        query = query.eq(k, options.filter[k]);
      }
    }
    var r = await query;
    if (r.error) throw r.error;
    return r.data || [];
  } catch (err) {
    console.error("[Supabase] query error:", err.message);
    return [];
  }
}

export async function supabaseInsert(table, data) {
  var supabase = getClient();
  if (!supabase) return null;
  try {
    var r = await supabase.from(table).insert(data).select();
    if (r.error) throw r.error;
    console.log("[Supabase] Inserted into " + table);
    return r.data;
  } catch (err) {
    console.error("[Supabase] insert error:", err.message);
    return null;
  }
}

export async function supabaseSearch(table, searchColumn, searchText, limit) {
  if (!limit) limit = 5;
  var supabase = getClient();
  if (!supabase) return [];
  try {
    var r = await supabase
      .from(table)
      .select("*")
      .textSearch(searchColumn, searchText)
      .limit(limit);
    if (r.error) throw r.error;
    return r.data || [];
  } catch (err) {
    console.error("[Supabase] search error:", err.message);
    return [];
  }
}

// ============================================================
// Memory functions
// ============================================================

export async function searchMemory(query, chatId) {
  var supabase = getClient();
  if (!supabase) return [];

  try {
    // 1) Try RPC (fast)
    var rpc = await supabase.rpc("search_memories", { search_query: query });
    if (!rpc.error && rpc.data && rpc.data.length > 0) {
      if (chatId) {
        var filtered = rpc.data.filter(function (x) {
          return String(x.chat_id || "") === String(chatId);
        });
        return filtered.length > 0 ? filtered : rpc.data;
      }
      return rpc.data;
    }

    if (rpc.error) {
      console.warn("[Memory] RPC failed:", rpc.error.message);
    }

    // 2) Fallback: ilike
    var q = supabase.from("memories").select("*");
    if (chatId) q = q.eq("chat_id", String(chatId));

    var fb = await q
      .or("task.ilike.%" + query + "%,result.ilike.%" + query + "%")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!fb.error) return fb.data || [];

    // 3) Last fallback: latest
    var q2 = supabase.from("memories").select("*");
    if (chatId) q2 = q2.eq("chat_id", String(chatId));
    var latest = await q2.order("created_at", { ascending: false }).limit(5);
    return (latest.data) || [];

  } catch (err) {
    console.error("[Memory] search failed:", err.message);
    return [];
  }
}

export async function saveMemory(task, result, chatId) {
  var supabase = getClient();
  if (!supabase) return;

  try {
    // TRUNCATE result to prevent tsvector overflow (max ~500KB safe)
    var safeResult = typeof result === "string" ? result : JSON.stringify(result);
    if (safeResult.length > 2000) {
      safeResult = safeResult.substring(0, 2000) + "... [truncated]";
    }

    var payload = {
      chat_id: chatId ? String(chatId) : null,
      task: (task || "").substring(0, 2000),
      result: safeResult,
      created_at: new Date().toISOString(),
    };

    var r = await supabase.from("memories").insert(payload);
    if (r.error) {
      console.error("[Memory] save error:", r.error.message);
    }
  } catch (err) {
    console.error("[Memory] save failed:", err.message);
  }
}

export async function logActivity(action, input, output, status) {
  if (!status) status = "success";
  var supabase = getClient();
  if (!supabase) return;
  try {
    await supabase.from("activity_logs").insert({
      action,
      input: typeof input === "string" ? input.substring(0, 2000) : JSON.stringify(input).substring(0, 2000),
      output: typeof output === "string" ? output.substring(0, 2000) : JSON.stringify(output).substring(0, 2000),
      status,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Tool] logActivity failed:", err.message);
  }
}
