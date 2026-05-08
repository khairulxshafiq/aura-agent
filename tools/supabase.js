import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
    const { data: result, error } = await supabase.from(table).insert(data).select();
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
