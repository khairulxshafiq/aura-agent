// ============================================================
// AURA v4.1 — Google Drive File Manager
// File: tools/gdrive.js
// Handles: base64 upload, URL download+upload, public sharing
// All files go to "Dump File" folder
// ============================================================

import axios from "axios";

var FOLDER_ID = process.env.GDRIVE_FOLDER_ID || "";
var SERVICE_ACCOUNT_KEY = null;

function getServiceAccount() {
  if (SERVICE_ACCOUNT_KEY) return SERVICE_ACCOUNT_KEY;
  try {
    SERVICE_ACCOUNT_KEY = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}");
    return SERVICE_ACCOUNT_KEY;
  } catch (e) {
    console.error("[GDrive] Failed to parse service account key:", e.message);
    return null;
  }
}

async function getAccessToken() {
  var sa = getServiceAccount();
  if (!sa || !sa.client_email || !sa.private_key) {
    throw new Error("Google Service Account key not configured");
  }

  var now = Math.floor(Date.now() / 1000);
  var header = { alg: "RS256", typ: "JWT" };
  var payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  var crypto = await import("crypto");
  var headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  var payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  var unsigned = headerB64 + "." + payloadB64;

  var sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  var signature = sign.sign(sa.private_key, "base64url");

  var jwt = unsigned + "." + signature;

  var resp = await axios.post("https://oauth2.googleapis.com/token", {
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt
  }, { timeout: 10000 });

  return resp.data.access_token;
}

// ============================================================
// Upload raw buffer to GDrive
// ============================================================
async function uploadBufferToGDrive(imageBuffer, mimeType, fileName, token) {
  if (!FOLDER_ID) throw new Error("GDRIVE_FOLDER_ID not configured");

  console.log("[GDrive] Uploading: " + fileName + " (" + Math.round(imageBuffer.length / 1024) + "KB)");

  var metadata = {
    name: fileName,
    parents: [FOLDER_ID],
    mimeType: mimeType
  };

  var base64Data = imageBuffer.toString("base64");

  var boundary = "aura_upload_" + Date.now();
  var body = "--" + boundary + "\r\n" +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) + "\r\n" +
    "--" + boundary + "\r\n" +
    "Content-Type: " + mimeType + "\r\n" +
    "Content-Transfer-Encoding: base64\r\n\r\n" +
    base64Data + "\r\n" +
    "--" + boundary + "--";

  var uploadResp = await axios.post(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
    body,
    {
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "multipart/related; boundary=" + boundary
      },
      timeout: 60000,
      maxContentLength: 50 * 1024 * 1024
    }
  );

  var fileId = uploadResp.data.id;
  console.log("[GDrive] Uploaded: " + fileId);

  // Set public sharing
  await axios.post(
    "https://www.googleapis.com/drive/v3/files/" + fileId + "/permissions",
    { role: "reader", type: "anyone" },
    { headers: { "Authorization": "Bearer " + token }, timeout: 10000 }
  );

  console.log("[GDrive] Public sharing set");

  return {
    success: true,
    fileId: fileId,
    url: "https://drive.google.com/uc?export=download&id=" + fileId,
    thumbnailUrl: "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000",
    webViewLink: uploadResp.data.webViewLink || "",
    fileName: fileName
  };
}

// ============================================================
// Upload base64 image to GDrive
