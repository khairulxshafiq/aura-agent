// ============================================================
// AURA v4.1 — Google Drive File Manager
// File: tools/gdrive.js
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
// Upload raw buffer to GDrive (internal helper)
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
// ============================================================
export async function uploadImageToGDrive(base64DataUri, fileName) {
  try {
    if (!fileName) fileName = "aura_" + Date.now() + ".png";

    var token = await getAccessToken();

    // Strip data URI prefix
    var base64Data = base64DataUri;
    var commaIndex = base64DataUri.indexOf(",");
    if (commaIndex > -1) {
      base64Data = base64DataUri.substring(commaIndex + 1);
    }

    // Detect mime type
    var mimeType = "image/png";
    if (base64DataUri.indexOf("image/jpeg") > -1) mimeType = "image/jpeg";
    else if (base64DataUri.indexOf("image/webp") > -1) mimeType = "image/webp";
    else if (base64DataUri.indexOf("image/gif") > -1) mimeType = "image/gif";

    var imageBuffer = Buffer.from(base64Data, "base64");
    console.log("[GDrive] uploadImageToGDrive: " + Math.round(imageBuffer.length / 1024) + "KB");

    return await uploadBufferToGDrive(imageBuffer, mimeType, fileName, token);

  } catch (err) {
    console.error("[GDrive] uploadImageToGDrive failed:", err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================
// Download image from URL + upload to GDrive
// ============================================================
export async function downloadAndUploadToGDrive(imageUrl, fileName) {
  try {
    if (!fileName) fileName = "aura_dl_" + Date.now() + ".png";

    console.log("[GDrive] Downloading: " + imageUrl.substring(0, 80));

    var token = await getAccessToken();

    // Download the image
    var resp = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AuraBot/1.0)"
      }
    });

    var imageBuffer = Buffer.from(resp.data);
    var contentType = resp.headers["content-type"] || "image/png";

    // Determine file extension from content type
    var extMap = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif"
    };
    var ext = extMap[contentType] || ".png";
    if (!fileName.includes(".")) fileName += ext;

    console.log("[GDrive] Downloaded: " + Math.round(imageBuffer.length / 1024) + "KB | " + contentType);

    return await uploadBufferToGDrive(imageBuffer, contentType, fileName, token);

  } catch (err) {
    console.error("[GDrive] downloadAndUploadToGDrive failed:", err.message);
    return { success: false, error: err.message };
  }
}
