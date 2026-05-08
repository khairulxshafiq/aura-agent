import { supabaseInsert, supabaseSearch, supabaseQuery } from "../tools/supabase.js";

const TABLE = "aura_memory";

export async function saveMemory(data) {
  try {
    await supabaseInsert(TABLE, {
      task: data.task,
      understanding: data.understanding,
      plan: JSON.stringify(data.plan),
      results: JSON.stringify(data.results),
      review: data.review,
      duration_ms: data.duration,
      created_at: data.timestamp || new Date().toISOString()
    });
    console.log("Memory saved");
  } catch (err) {
    console.error("Memory save error:", err.message);
  }
}

export async function getRelevantMemory(task) {
  try {
    const results = await supabaseSearch(TABLE, "task", task, 5);
    if (results.length === 0) {
      return await supabaseQuery(TABLE, { order: "created_at", limit: 5 });
    }
    return results;
  } catch (err) {
    console.error("Memory fetch error:", err.message);
    return [];
  }
}

export async function getAllMemory() {
  return await supabaseQuery(TABLE, { order: "created_at", limit: 50 });
}
