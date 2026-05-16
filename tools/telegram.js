import axios from "axios";

var TOKEN = process.env.TELEGRAM_BOT_TOKEN;
var CHAT_ID = process.env.TELEGRAM_CHAT_ID;
var API = "https://api.telegram.org/bot" + TOKEN;

// === Send Text Message ===
export async function sendTelegram(message, options) {
  try {
    if (!options) { options = {}; }
    var chatId = options.chatId || CHAT_ID;
    var MAX = 4000;
    var chunks = [];
    var remaining = message || "";
    while (remaining.length > 0) {
      chunks.push(remaining.substring(0, MAX));
      remaining = remaining.substring(MAX);
    }
    for (var i = 0; i < chunks.length; i++) {
      try {
        await axios.post(API + "/sendMessage", { chat_id: chatId, text: chunks[i] });
      } catch (err) {
        await axios.post(API + "/sendMessage", { chat_id: chatId, text: chunks[i].substring(0, 500) + "\n\n[mesej dipendekkan]" });
      }
    }
    console.log("Telegram sent");
    return { sent: true };
  } catch (err) {
    console.error("Telegram error:", err.message);
    return { sent: false, error: err.message };
  }
}

// === Send Image by URL ===
export async function sendTelegramImage(imageUrl, caption, options) {
  try {
    if (!options) { options = {}; }
    var chatId = options.chatId || CHAT_ID;
    await axios.post(API + "/sendPhoto", {
      chat_id: chatId,
      photo: imageUrl,
      caption: (caption || "").substring(0, 1024)
    });
    console.log("Telegram image sent");
    return { sent: true };
  } catch (err) {
    console.error("Telegram image error:", err.message);
    return { sent: false, error: err.message };
  }
}

// === Send Base64 Image as Photo ===
export async function sendTelegramBase64Image(base64DataUri, caption, options) {
  try {
    if (!options) { options = {}; }
    var chatId = options.chatId || CHAT_ID;

    // Strip data URI prefix
    var base64Data = base64DataUri;
    var commaIndex = base64DataUri.indexOf(",");
    if (commaIndex > -1) {
      base64Data = base64DataUri.substring(commaIndex + 1);
    }

    // Convert to Buffer
    var imageBuffer = Buffer.from(base64Data, "base64");
    console.log("[Telegram] Base64 image size: " + Math.round(imageBuffer.length / 1024) + "KB");

    // Use Node 22 global FormData + Blob
    var form = new FormData();
    form.append("chat_id", chatId.toString());
    form.append("photo", new Blob([imageBuffer], { type: "image/png" }), "generated.png");
    if (caption) {
      form.append("caption", caption.substring(0, 1024));
    }

    await fetch(API + "/sendPhoto", { method: "POST", body: form });

    console.log("[Telegram] Base64 image sent as photo!");
    return { sent: true };

  } catch (err) {
    console.error("[Telegram] Base64 image error:", err.message);
    return { sent: false, error: err.message };
  }
}

// === Smart Response: auto-detect image vs text ===
export async function sendSmartResponse(chatId, responseText) {
  try {
    if (!responseText) { return { sent: false }; }

    // Check if response contains base64 image
    if (responseText.indexOf("data:image") > -1) {
      console.log("[Telegram] Detected base64 image in response");

      // Extract caption (text before the data:image part)
      var imgIndex = responseText.indexOf("data:image");
      var caption = responseText.substring(0, imgIndex).trim();
      if (!caption) { caption = "Gambar siap!"; }

      // Extract base64 data URI
      var dataUri = responseText.substring(imgIndex).trim();

      return await sendTelegramBase64Image(dataUri, caption, { chatId: chatId });
    }

    // Check if response is a URL (http image)
    if (
      responseText.indexOf("http") > -1 &&
      (responseText.indexOf(".png") > -1 || responseText.indexOf(".jpg") > -1 || responseText.indexOf(".webp") > -1)
    ) {
      console.log("[Telegram] Detected image URL in response");
      var urlMatch = responseText.match(/https?:\/\/[^\s"]+\.(png|jpg|jpeg|webp|gif)[^\s"]*/i);
      if (urlMatch) {
        var textPart = responseText.replace(urlMatch[0], "").trim();
        if (!textPart) { textPart = "Gambar siap!"; }
        return await sendTelegramImage(urlMatch[0], textPart, { chatId: chatId });
      }
    }

    // Normal text response
    return await sendTelegram(responseText, { chatId: chatId });

  } catch (err) {
    console.error("[Telegram] Smart response error:", err.message);
    return await sendTelegram(responseText || "Error sending response", { chatId: chatId });
  }
}

// === Typing Indicator ===
export async function sendTelegramTyping(chatId) {
  try {
    await axios.post(API + "/sendChatAction", { chat_id: chatId || CHAT_ID, action: "typing" });
  } catch (err) { /* silent */ }
}

// === Get File Info ===
export async function getTelegramFile(fileId) {
  try {
    var resp = await axios.get(API + "/getFile?file_id=" + fileId);
    if (resp.data.ok) {
      return "https://api.telegram.org/file/bot" + TOKEN + "/" + resp.data.result.file_path;
    }
    return null;
  } catch (err) {
    console.error("Telegram getFile error:", err.message);
    return null;
  }
}

// === Download File as Base64 ===
export async function downloadTelegramFile(fileId) {
  try {
    var fileResp = await axios.get(API + "/getFile?file_id=" + fileId);
    if (!fileResp.data.ok) {
      return { url: null, base64: null };
    }
    var filePath = fileResp.data.result.file_path;
    var fileUrl = "https://api.telegram.org/file/bot" + TOKEN + "/" + filePath;
    console.log("[Telegram] Downloading image: " + filePath);
    var imgResp = await axios.get(fileUrl, { responseType: "arraybuffer" });
    var buffer = Buffer.from(imgResp.data);
    var ext = filePath.split(".").pop().toLowerCase();
    var mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
    var mime = mimeMap[ext] || "image/jpeg";
    var base64 = "data:" + mime + ";base64," + buffer.toString("base64");
    console.log("[Telegram] Image downloaded: " + Math.round(buffer.length / 1024) + "KB");
    return { url: fileUrl, base64: base64 };
  } catch (err) {
    console.error("[Telegram] downloadFile failed:", err.message);
    return { url: null, base64: null };
  }
}
