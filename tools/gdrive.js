// ============================================================
// tools/gdrive.js — GDrive Service Account Upload (FIXED)
// AURA v4.2.x
// ============================================================

import axios from "axios";

var FOLDER_ID = process.env.GDRIVE_FOLDER_ID || "";
var SERVICE_ACCOUNT = null;

function loadServiceAccount() {
  if (SERVICE_ACCOUNT) return SERVICE_ACCOUNT;

  var raw =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    process.env.GDRIVE_SERVICE_ACCOUNT_KEY ||
    "";

  if (!raw) return null;

  try {
    var obj = JSON.parse(raw);

    // ✅ FIX: convert "\\n" to real newlines
    if (obj.private_key && obj.private_key.indexOf("\\n") > -1) {
      obj.private_key = obj.private_key.replace(/\\n/g, "\n");
    }

    SERVICE_ACCOUNT = obj;
    return SERVICE_ACCOUNT;
  } catch (e) {
    console.error("[GDrive] Failed to parse service account key:", e.message);
    return null;
  }
}

async function getAccessToken() {
  var sa = loadServiceAccount();
  if (!sa || !sa.client_email || !sa.private_key) {
    throw new Error("Google Service Account key not configured");
  }

  var now = Math.floor(Date.now() / 1000);
  var header = { alg: "RS256", typ: "JWT" };
  var payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  var crypto = await import("crypto");

  var headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  var payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  var unsigned = headerB64 + "." + payloadB64;

  var sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  var signature = sign.sign(sa.private_key, "base64url");
  var jwt = unsigned + "." + signature;

  var resp = await axios.post(
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
  try {
    await axios.post(
      "https://www.googleapis.com/drive/v3/files/" + fileId + "/permissions",
      { role: "reader", type: "anyone" },
      { headers: { Authorization: "Bearer " + token }, timeout: 15000 }
    );
  } catch (err) {
    var errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("[GDrive] setPublicPermission failed:", errData);
  }
}

async function uploadBufferToDrive(buffer, mimeType, fileName, token) {
  if (!FOLDER_ID) throw new Error("GDRIVE_FOLDER_ID not configured");

  console.log("[GDrive] Folder ID: " + FOLDER_ID);
  console.log("[GDrive] Uploading: " + fileName + " (" + Math.round(buffer.length / 1024) + "KB)");

  var metadata = { name: fileName, parents: [FOLDER_ID], mimeType: mimeType };
  var boundary = "aura_" + Date.now();
  var base64Data = buffer.toString("base64");

  var body =
    "--" + boundary + "\r\n" +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) + "\r\n" +
    "--" + boundary + "\r\n" +
    "Content-Type: " + mimeType + "\r\n" +
    "Content-Transfer-Encoding: base64\r\n\r\n" +
    base64Data + "\r\n" +
    "--" + boundary + "--";

  try {
    var uploadResp = await axios.post(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
      body,
      {
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "multipart/related; boundary=" + boundary,
        },
        timeout: 60000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
      }
    );

    var fileId = uploadResp.data.id;
    console.log("[GDrive] Uploaded: " + fileId);

    await setPublicPermission(fileId, token);

    return {
      success: true,
      fileId: fileId,
      fileName: fileName,
      url: "https://drive.google.com/uc?export=download&id=" + fileId,
      thumbnailUrl: "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000",
      webViewLink: uploadResp.data.webViewLink || "",
    };
  } catch (err) {
    var status = err.response ? err.response.status : "no response";
    var data = err.response ? JSON.stringify(err.response.data, null, 2) : "{}";
    console.error("[GDrive] Upload FAILED status: " + status);
    console.error("[GDrive] Upload FAILED data: " + data);
    throw err;
  }
}

export async function uploadImageToGDrive(base64DataUri, fileName) {
  try {
    if (!fileName) fileName = "aura_" + Date.now() + ".png";
    if (!base64DataUri || base64DataUri.indexOf("base64") === -1) {
      throw new Error("uploadImageToGDrive expects base64 data URI");
    }

    var token = await getAccessToken();
    var comma = base64DataUri.indexOf(",");
    var raw = comma > -1 ? base64DataUri
