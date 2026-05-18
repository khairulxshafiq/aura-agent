// ============================================================
// AURA v4.1 — tools/supabase.js (FIXED)
// - Uses SUPABASE_SERVICE_ROLE_KEY when available (recommended)
// - Aligns tables with SQL setup: memories + activity_logs
// - Keeps legacy helpers: supabaseQuery, supabaseInsert, supabaseSearch
// ============================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const TABLE_MEMORIES = process.env.SUPABASE_MEMORIES_TABLE || "memories";
const TABLE_ACTIVITY = process.env.SUPABASE_ACTIVITY_TABLE || "activity_logs";

let _client = null;

function getClient() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(
      "[Supabase] Missing SUPABASE_URL or SUPABASE key (set SUPABASE_SERVICE_ROLE_KEY recommended)."
    );
    return null;
  }
  _client = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _client;
}

// === Existing functions (keep) ===
export async function supabaseQuery(table, options = {}) {
  const supabase = getClient();
  if (!supabase) return [];

  try {
    let query = supabase.from(table).select("*");

    if (options.order) query = query.order(options.order, { ascending: false });
    if (options.limit) query = query.limit(options.limit);

    if (options.filter) {
      for (const [key, value] of Object.entries(options.filter)) {
        query = query.eq(key, value);
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("[Supabase] query error:", err.message);
    return [];
  }
}

export async function supabaseInsert(table, data) {
  const supabase = getClient();
  if (!supabase) return null;

  try {
    const { data: result, error } = await supabase.from(table).insert(data).select();
    if (error) throw error;
    console.log(`[Supabase] Inserted into ${table}`);
    return result;
  } catch (err) {
    console.error("[Supabase] insert error:", err.message);
    return null;
  }
}

export async function supabaseSearch(table, searchColumn, searchText, limit = 5) {
  const supabase = getClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .textSearch(searchColumn, searchText)
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("[Supabase] search error:", err.message);
    return [];
  }
}

// ============================================================
// Memory functions
// ============================================================

export async function searchMemory(query, chatId = null) {
  const supabase = getClient();
  if (!supabase) return [];

  try {
    // 1) Try RPC (fast + accurate)
    const { data, error } = await supabase.rpc("search_memories", {
      search_query: query,
    });

    if (!error && data) {
      // If chatId provided, prefer matching chatId
      if (chatId) {
        const filtered = data.filter((x) => String(x.chat_id || "") === String(chatId));
        return filtered.length ? filtered : data;
      }
      return data;
    }

    if (error) {
      console.warn("[Memory] RPC search_memories not available or failed:", error.message);
    }

    // 2) Fallback: ilike search
    let q = supabase.from(TABLE_MEMORIES).select("*");
    if (chatId) q = q.eq("chat_id", String(chatId));

    const { data: fallback, error: err2 } = await q
      .or(`task.ilike.%${query}%,result.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!err2) return fallback || [];

    console.warn("[Memory] ilike fallback failed:", err2.message);

    // 3) Last fallback: latest
    let q2 = supabase.from(TABLE_MEMORIES).select("*");
    if (chatId) q2 = q2.eq("chat_id", String(chatId));

    const { data: latest } = await q2.order("created_at", { ascending: false }).limit(5);
    return latest || [];
  } catch (err) {
    console.error("[Memory] search failed:", err.message);
    return [];
  }
}

export async function saveMemory(task, result, chatId = null) {
  const supabase = getClient();
  if (!supabase) return;

  try {
    const payload = {
      chat_id: chatId ? String(chatId) : null,
      task: task,
      result: typeof result === "string" ? result : JSON.stringify(result),
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from(TABLE_MEMORIES).insert(payload);
    if (error) {
      console.error("[Memory] save error:", error.message);
    }
  } catch (err) {
    console.error("[Memory] save failed:", err.message);
  }
}

export async function logActivity(action, input, output, status = "success") {
  const supabase = getClient();
  if (!supabase) return;

  try {
    await supabase.from(TABLE_ACTIVITY).insert({
      action,
      input: typeof input === "string" ? input : JSON.stringify(input),
      output:
        typeof output === "string"
          ? output.substring(0, 2000)
          : JSON.stringify(output).substring(0, 2000),
      status,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Tool] logActivity failed:", err.message);
  }
}

export default {
  supabaseQuery,
  supabaseInsert,
  supabaseSearch,
  searchMemory,
  saveMemory,
  logActivity,
};
