import axios from "axios";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegram(message, options = {}) {
  try {
    const { chatId = CHAT_ID, parseMode = "HTML" } = options;
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: parseMode
    });
    console.log("Telegram sent");
    return { sent: true };
  } catch (err) {
    console.error("Telegram error:", err.message);
    return { sent: false, error: err.message };
  }
}

export async function sendTelegramImage(imageUrl, caption = "") {
  try {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
      chat_id: CHAT_ID,
      photo: imageUrl,
      caption
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}
