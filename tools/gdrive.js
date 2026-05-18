// ============================================================
// AURA v4.2 — Google Drive Manager (Service Account)
// File: tools/gdrive.js
// ============================================================
// Features:
// - Robust parsing GOOGLE_SERVICE_ACCOUNT_KEY (fix \n in private_key)
// - Upload buffer/base64/url to Drive folder
// - Set public permission anyone-with-link
// - testGDrive() + uploadTestImage() helper
// ============================================================

import axios from "axios";

const FOLDER_ID = process.env.GDRIVE_FOLDER_ID || "";
let SERVICE_ACCOUNT = null;

function loadServiceAccount() {
  if (SERVICE_ACCOUNT) return SERVICE_ACCOUNT;

  const raw =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    process.env.GDRIVE_SERVICE_ACCOUNT_KEY ||
    "";

  if (!raw) return null;

  try {
    const obj = JSON.parse(raw);

    // Fix escaped newline issue
    if (obj.private_key && obj.private_key.includes("\\n")) {
      obj.private_key = obj.private_key.replace(/\\n/g, "\n");
    }

    SERVICE_ACCOUNT = obj;
    return SERVICE_ACCOUNT;
  } catch (e) {
    console.error("[GDrive] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:", e.message);
    return null;
  }
}

async function getAccessToken() {
  const sa = loadServiceAccount();
  if (!sa || !sa.client_email || !sa.private_key) {
    throw new Error(
      "Google Service Account key not configured (missing client_email/private_key)"
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const crypto = await import("crypto");

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsigned = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${unsigned}.${signature}`;

  const resp = await axios.post(
    "https://oauth2.googleapis.com/token",
    {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    },
    { timeout: 15000 }
  );

  return resp.data.access_token;
}

async function setPublicPermission(fileId, token) {
  await axios.post(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    { role: "reader", type: "anyone" },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
  );
}

async function uploadBufferToDrive(buffer, mimeType, fileName, token) {
  if (!FOLDER_ID) throw new Error("GDRIVE_FOLDER_ID not configured");

  const metadata = { name: fileName, parents: [FOLDER_ID], mimeType };

  const boundary = `aura_${Date.now()}`;
  const base64Data = buffer.toString("base64");

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${base64Data}\r\n` +
    `--${boundary}--`;

  const uploadResp = await axios.post(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
    body,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      timeout: 60000,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    }
  );

  const fileId = uploadResp.data.id;

  // Make public
  await setPublicPermission(fileId, token);

  return {
    success: true,
    fileId,
    fileName,
    // Airtable-friendly direct link:
    url: `https://drive.google.com/uc?export=download&id=${fileId}`,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
    webViewLink: uploadResp.data.webViewLink || "",
  };
}

// ============================================================
// Public APIs
// ============================================================

export async function uploadImageToGDrive(base64DataUri, fileName = null) {
  try {
    if (!fileName) fileName = `aura_${Date.now()}.png`;
    const token = await getAccessToken();

    if (!base64DataUri || !base64DataUri.includes("base64")) {
      throw new Error("uploadImageToGDrive expects base64 data URI (data:image/...;base64,...)");
    }

    const comma = base64DataUri.indexOf(",");
    const raw = comma > -1 ? base64DataUri.substring(comma + 1) : base64DataUri;

    let mimeType = "image/png";
    if (base64DataUri.includes("image/jpeg")) mimeType = "image/jpeg";
    else if (base64DataUri.includes("image/webp")) mimeType = "image/webp";
    else if (base64DataUri.includes("image/gif")) mimeType = "image/gif";

    const buffer = Buffer.from(raw, "base64");

    console.log(`[GDrive] uploadImageToGDrive: ${Math.round(buffer.length / 1024)}KB`);
    return await uploadBufferToDrive(buffer, mimeType, fileName, token);
  } catch (err) {
    console.error("[GDrive] uploadImageToGDrive failed:", err.message);
    return { success: false, error: err.message };
  }
}

export async function downloadAndUploadToGDrive(imageUrl, fileName = null) {
  try {
    if (!fileName) fileName = `aura_dl_${Date.now()}.png`;
    const token = await getAccessToken();

    console.log("[GDrive] Downloading:", (imageUrl || "").substring(0, 120));

    const resp = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AuraBot/1.0)" },
    });

    const buffer = Buffer.from(resp.data);
    const contentType = resp.headers["content-type"] || "image/png";

    const extMap = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };

    const ext = extMap[contentType] || ".png";
    if (!fileName.includes(".")) fileName += ext;

    console.log(`[GDrive] Downloaded: ${Math.round(buffer.length / 1024)}KB | ${contentType}`);
    return await uploadBufferToDrive(buffer, contentType, fileName, token);
  } catch (err) {
    console.error("[GDrive] downloadAndUploadToGDrive failed:", err.message);
    return { success: false, error: err.message };
  }
}

export async function testGDrive() {
  try {
    const token = await getAccessToken();
    const content = Buffer.from(`AURA GDrive test OK @ ${new Date().toISOString()}`, "utf-8");
    const res = await uploadBufferToDrive(content, "text/plain", `aura_test_${Date.now()}.txt`, token);
    return { success: true, ...res };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Tiny 1x1 PNG (transparent) for upload test
const TINY_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

export async function uploadTestImage() {
  return await uploadImageToGDrive(TINY_PNG_BASE64, `aura_img_test_${Date.now()}.png`);
}

export default {
  uploadImageToGDrive,
  downloadAndUploadToGDrive,
  testGDrive,
  uploadTestImage,
};
