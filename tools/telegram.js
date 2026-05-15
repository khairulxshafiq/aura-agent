import axios from "axios";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API = `https://api.telegram.org/bot${TOKEN}`;

export async function sendTelegram(message, options = {}) {
  try {
    const { chatId = CHAT_ID, parseMode } = options;
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
        // Fallback: send without parse_mode
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
      caption: caption,
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
    // Silent fail - typing indicator is not critical
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
