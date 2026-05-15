import axios from "axios";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API = `https://api.telegram.org/bot${TOKEN}`;

export async function sendTelegram(message, options = {}) {
  try {
    const { chatId = CHAT_ID } = options;
    const MAX = 4000;
    const chunks = [];
    let remaining = message || "";
    while (remaining.length > 0) {
      chunks.push(remaining.substring(0, MAX));
      remaining = remaining.substring(MAX);
    }

    for (const chunk of chunks) {
      try {
        await axios.post(`${API}/sendMessage`, {
          chat_id: chatId,
          text: chunk,
        });
      } catch (err) {
        await axios.post(`${API}/sendMessage`, {
          chat_id: chatId,
          text: chunk.substring(0, 500) + "\n\n[mesej dipendekkan]",
        });
      }
    }
    console.log("Telegram sent");
    return { sent: true };
  } catch (err) {
    console.error("Telegram error:", err.message);
    return { sent: false, error: err.message };
  }
}

export async function sendTelegramImage(imageUrl, caption = "", options = {}) {
  try {
    const { chatId = CHAT_ID } = options;
    await axios.post(`${API}/sendPhoto`, {
      chat_id: chatId,
      photo: imageUrl,
      caption: caption.substring(0, 1024),
    });
    console.log("Telegram image sent");
    return { sent: true };
  } catch (err) {
    console.error("Telegram image error:", err.message);
    return { sent: false, error: err.message };
  }
}

export async function sendTelegramTyping(chatId) {
  try {
    await axios.post(`${API}/sendChatAction`, {
      chat_id: chatId || CHAT_ID,
      action: "typing",
    });
  } catch (err) {
    // Silent fail
  }
}

export async function getTelegramFile(fileId) {
  try {
    const resp = await axios.get(`${API}/getFile?file_id=${fileId}`);
    if (resp.data.ok) {
      return `https://api.telegram.org/file/bot${TOKEN}/${resp.data.result.file_path}`;
    }
    return null;
  } catch (err) {
    console.error("Telegram getFile error:", err.message);
    return null;
  }
}

// NEW: Download file and convert to base64 for AI vision
export async function downloadTelegramFile(fileId) {
  try {
    // Step 1: Get file path from Telegram
    const fileResp = await axios.get(`${API}/getFile?file_id=${fileId}`);
    if (!fileResp.data.ok) {
      console.error("getTelegramFile failed:", fileResp.data);
      return { url: null, base64: null };
    }

    const filePath = fileResp.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

    // Step 2: Download the actual image bytes
    console.log("[Telegram] Downloading image:", filePath);
    const imgResp = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(imgResp.data);

    // Step 3: Detect mime type from extension
    const ext = filePath.split(".").pop().toLowerCase();
    const mimeMap = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      bmp: "image/bmp",
    };
    const mime = mimeMap[ext] || "image/jpeg";

    // Step 4: Convert to base64 data URI
    const base64 = `data:${mime};base64,${buffer.toString("base64")}`;
    console.log("[Telegram] Image downloaded:", Math.round(buffer.length / 1024), "KB");

    return { url: fileUrl, base64 };
  } catch (err) {
    console.error("[Telegram] downloadFile failed:", err.message);
    return { url: null, base64: null };
  }
}
