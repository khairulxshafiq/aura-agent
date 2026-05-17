// ============================================================
// AURA v4.1 — Airtable Integration (Content Staging)
// File: tools/airtable.js
// ============================================================

import axios from "axios";

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;            // PAT token
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;        // e.g. appXXXXXXXXXXXXXX
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || "Content Station"; // table name

const AIRTABLE_API = "https://api.airtable.com/v0";

function assertEnv() {
  if (!AIRTABLE_TOKEN) throw new Error("Missing AIRTABLE_TOKEN env var");
  if (!AIRTABLE_BASE_ID) throw new Error("Missing AIRTABLE_BASE_ID env var");
  if (!AIRTABLE_TABLE) throw new Error("Missing AIRTABLE_TABLE env var");
}

function headers() {
  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };
}

// Normalize fields to match Airtable column names exactly
function cleanFields(fields) {
  const out = {};
  Object.keys(fields || {}).forEach((k) => {
    const v = fields[k];
    if (v === undefined) return;
    out[k] = v;
  });
  return out;
}

// ============================================================
// Create Record
// ============================================================
export async function airtableCreate(fields, options = {}) {
  assertEnv();

  const table = options.table || AIRTABLE_TABLE;
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;

  const body = { fields: cleanFields(fields) };

  const resp = await axios.post(url, body, { headers: headers(), timeout: 20000 });
  return resp.data; // contains id, fields, createdTime
}

// ============================================================
// Update Record (PATCH)
// ============================================================
export async function airtableUpdate(recordId, fields, options = {}) {
  assertEnv();

  if (!recordId) throw new Error("airtableUpdate requires recordId");

  const table = options.table || AIRTABLE_TABLE;
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}/${recordId}`;

  const body = { fields: cleanFields(fields) };

  const resp = await axios.patch(url, body, { headers: headers(), timeout: 20000 });
  return resp.data;
}

// ============================================================
// Find Records (by formula)
// Example formula: {Status}="Draft"
// ============================================================
export async function airtableFindByFormula(formula, options = {}) {
  assertEnv();

  const table = options.table || AIRTABLE_TABLE;
  const maxRecords = options.maxRecords || 5;
  const sortField = options.sortField || "Created";
  const sortDirection = options.sortDirection || "desc";

  const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;

  const params = {
    filterByFormula: formula,
    maxRecords,
    sort: [{ field: sortField, direction: sortDirection }]
  };

  const resp = await axios.get(url, { headers: headers(), params, timeout: 20000 });
  return resp.data; // { records: [...] }
}

// ============================================================
// Get Record by ID
// ============================================================
export async function airtableGet(recordId, options = {}) {
  assertEnv();

  const table = options.table || AIRTABLE_TABLE;
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}/${recordId}`;

  const resp = await axios.get(url, { headers: headers(), timeout: 20000 });
  return resp.data;
}
