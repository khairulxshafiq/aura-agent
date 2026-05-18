// ============================================================
// AURA v4.1 — Google Drive Upload (Image Hosting)
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

export async function uploadImageToGDrive(base64DataUri, fileName) {
  if (!FOLDER_ID) {
    console.error("[GDrive] GDRIVE_FOLDER_ID not set");
    return { success: false, error: "GDRIVE_FOLDER_ID not configured" };
  }

  try {
    var token = await getAccessToken();

    var base64Data = base64DataUri;
    var mimeType = "image/png";
    var dataUriMatch = base64DataUri.match(/^data:(image\/[a-zA-Z]+);base64,/);
    if (dataUriMatch) {
      mimeType = dataUriMatch[1];
      base64Data = base64DataUri.substring(dataUriMatch[0].length);
    }

    var imageBuffer = Buffer.from(base64Data, "base64");

    if (!fileName) {
      var ext = mimeType.split("/")[1] || "png";
      fileName = "aura_" + Date.now() + "." + ext;
    }

    console.log("[GDrive] Uploading: " + fileName + " (" + Math.round(imageBuffer.length / 1024) + "KB)");

    var metadata = {
      name: fileName,
      parents: [FOLDER_ID],
      mimeType: mimeType
    };

    var boundary = "aura_upload_boundary_" + Date.now();
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
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024
      }
    );

    var fileId = uploadResp.data.id;
    console.log("[GDrive] Uploaded: " + fileId);

    await axios.post(
      "https://www.googleapis.com/drive/v3/files/" + fileId + "/permissions",
      { role: "reader", type: "anyone" },
      {
        headers: { "Authorization": "Bearer " + token },
        timeout: 10000
      }
    );

    console.log("[GDrive] Permission set: anyone can view");

    var directUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
    var thumbnailUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000";

    return {
      success: true,
      fileId: fileId,
      url: directUrl,
      thumbnailUrl: thumbnailUrl,
      webViewLink: uploadResp.data.webViewLink || "",
      fileName: fileName
    };

  } catch (err) {
    console.error("[GDrive] Upload failed:", err.message);
    if (err.response) {
      console.error("[GDrive] Status:", err.response.status);
      console.error("[GDrive] Data:", JSON.stringify(err.response.data || {}).substring(0, 500));
    }
    return { success: false, error: err.message };
  }
}

export default { uploadImageToGDrive };
