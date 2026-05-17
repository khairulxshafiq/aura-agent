// ============================================================
// AURA v4.1 — Airtable Integration (Content Staging)
// File: tools/airtable.js
// ============================================================

import axios from "axios";

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// Prefer TABLE_ID if provided (more stable than table name)
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID || null;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || "Content Station";

const AIRTABLE_API = "https://api.airtable.com/v0";

function assertEnv() {
  if (!AIRTABLE_TOKEN) throw new Error("Missing AIRTABLE_TOKEN env var");
  if (!AIRTABLE_BASE_ID) throw new Error("Missing AIRTABLE_BASE_ID env var");
  if (!AIRTABLE_TABLE_ID && !AIRTABLE_TABLE) throw new Error("Missing AIRTABLE_TABLE or AIRTABLE_TABLE_ID env var");
}

function headers() {
  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };
}

// Use table id if exists, else encode table name
function tablePath(options = {}) {
  const table = options.table || AIRTABLE_TABLE;
  const tableId = options.tableId || AIRTABLE_TABLE_ID;
  return tableId ? tableId : encodeURIComponent(table);
}

function cleanFields(fields) {
  const out = {};
  Object.keys(fields || {}).forEach((k) => {
    const v = fields[k];
    if (v === undefined) return;
    out[k] = v;
  });
  return out;
}

function logAirtableError(prefix, err) {
  if (!err) return;
  if (err.response) {
    console.error(prefix + " Status:", err.response.status);
    console.error(prefix + " Data:", JSON.stringify(err.response.data || {}).substring(0, 1200));
  } else {
    console.error(prefix + " Error:", err.message);
  }
}

// ============================================================
// Create Record
// ============================================================
export async function airtableCreate(fields, options = {}) {
  assertEnv();
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${tablePath(options)}`;

  try {
    const body = {
      records: [
        { fields: cleanFields(fields) }
      ],
      typecast: true // IMPORTANT: helps single select / date coercion
    };

    const resp = await axios.post(url, body, { headers: headers(), timeout: 20000 });
    // Airtable returns {records:[{id, fields, createdTime}]}
    return resp.data.records && resp.data.records[0] ? resp.data.records[0] : resp.data;
  } catch (err) {
    logAirtableError("[AirtableCreate]", err);
    throw err;
  }
}

// ============================================================
// Update Record (PATCH)
// ============================================================
export async function airtableUpdate(recordId, fields, options = {}) {
  assertEnv();
  if (!recordId) throw new Error("airtableUpdate requires recordId");

  const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${tablePath(options)}`;

  try {
    const body = {
      records: [
        { id: recordId, fields: cleanFields(fields) }
      ],
      typecast: true
    };

    const resp = await axios.patch(url, body, { headers: headers(), timeout: 20000 });
    return resp.data.records && resp.data.records[0] ? resp.data.records[0] : resp.data;
  } catch (err) {
    logAirtableError("[AirtableUpdate]", err);
    throw err;
  }
}

// ============================================================
// Find Records (by formula)
// ============================================================
export async function airtableFindByFormula(formula, options = {}) {
  assertEnv();

  const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${tablePath(options)}`;

  const maxRecords = options.maxRecords || 5;

  // Airtable query params format: filterByFormula, maxRecords
  const params = {
    filterByFormula: formula,
    maxRecords: maxRecords
  };

  try {
    const resp = await axios.get(url, { headers: headers(), params, timeout: 20000 });
    return resp.data; // { records: [...] }
  } catch (err) {
    logAirtableError("[AirtableFind]", err);
    throw err;
  }
}

// ============================================================
// Get Record by ID
// ============================================================
export async function airtableGet(recordId, options = {}) {
  assertEnv();
  if (!recordId) throw new Error("airtableGet requires recordId");

  const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${tablePath(options)}/${recordId}`;

  try {
    const resp = await axios.get(url, { headers: headers(), timeout: 20000 });
    return resp.data;
  } catch (err) {
    logAirtableError("[AirtableGet]", err);
    throw err;
  }
}
