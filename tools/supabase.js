import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// === Existing functions (keep) ===

export async function supabaseQuery(table, options = {}) {
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
    console.error("Supabase query error:", err.message);
    return [];
  }
}

export async function supabaseInsert(table, data) {
  try {
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select();
    if (error) throw error;
    console.log(`Inserted into ${table}`);
    return result;
  } catch (err) {
    console.error("Supabase insert error:", err.message);
    return null;
  }
}

export async function supabaseSearch(table, searchColumn, searchText, limit = 5) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .textSearch(searchColumn, searchText)
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Supabase search error:", err.message);
    return [];
  }
}

// === NEW: Memory functions ===

export async function searchMemory(query) {
  try {
    // Try RPC search first
    const { data, error } = await supabase.rpc("search_memories", {
      search_query: query,
    });

    if (error) {
      console.error("Memory RPC error:", error.message);
      // Fallback: ilike search
      const { data: fallback, error: err2 } = await supabase
        .from("memories")
        .select("*")
        .ilike("task", `%${query}%`)
        .order("created_at", { ascending: false })
        .limit(5);

      if (err2) {
        // Last fallback: just get latest
        const { data: latest } = await supabase
          .from("memories")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5);
        return latest || [];
      }
      return fallback || [];
    }
    return data || [];
  } catch (err) {
    console.error("Memory search failed:", err.message);
    return [];
  }
}

export async function saveMemory(task, result) {
  try {
    const { error } = await supabase.from("memories").insert({
      task: task,
      result: typeof result === "string" ? result : JSON.stringify(result),
      created_at: new Date().toISOString(),
    });
    if (error) console.error("Memory save error:", error.message);
  } catch (err) {
    console.error("Memory save failed:", err.message);
  }
}

export async function logActivity(action, input, output, status = "success") {
  try {
    await supabase.from("activity_logs").insert({
      action,
      input: typeof input === "string" ? input : JSON.stringify(input),
      output: typeof output === "string"
        ? output.substring(0, 1000)
        : JSON.stringify(output).substring(0, 1000),
      status,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Tool] logActivity failed:", err.message);
  }
}
