// ============================================================
// ✅ ROOT ENTRYPOINT — index.js (SERVER)
// AURA v4.2.x — Express Webhook + API
// NOTE: This is ROOT index.js (not tools/index.js)
// ============================================================

import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { runOrchestrator } from "./orchestrator.js";
import {
  sendTelegram,
  sendTelegramTyping,
  sendSmartResponse,
  downloadTelegramFile,
} from "./tools/telegram.js";

import { TOOLS, TOOL_DESCRIPTIONS } from "./tools/index.js";

const app = express();
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN;

// === Helper: Check if bot is mentioned ===
function isBotMentioned(text, message) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  if (lower.includes("@auraagentic")) return true;
  if (lower.includes("aura")) return true;
  if (
    message &&
    message.reply_to_message &&
    message.reply_to_message.from &&
    message.reply_to_message.from.is_bot
  )
    return true;
  return false;
}

// === Helper: Strip bot mention from text ===
function stripBotMention(text) {
  if (!text) return text;
  return String(text)
    .replace(/@auraagentic/gi, "")
    .replace(/^aura[,:]?\s*/i, "")
    .trim();
}

// === Helper: Check if group chat ===
function isGroupChat(message) {
  return message.chat.type === "group" || message.chat.type === "supergroup";
}

// === Health ===
app.get("/", (req, res) => {
  res.json({
    status: "AURA - Autonomous AI OS",
    version: "4.2.x",
    tools: Object.keys(TOOL_DESCRIPTIONS || {}),
  });
});

// === Telegram Webhook ===
app.post("/telegram", async (req, res) => {
  try {
    const message = req.body.message || req.body.edited_message;
    if (!message) return res.sendStatus(200);

    const chatId = message.chat.id;
    const userName = message.from && message.from.first_name ? message.from.first_name : "User";
    const isGroup = isGroupChat(message);

    // === PHOTO messages ===
    if (message.photo) {
      const caption = message.caption || "";
      if (isGroup && !isBotMentioned(caption, message)) {
        return res.sendStatus(200);
      }

      const photoIndex = Math.min(2, message.photo.length - 1);
      const fileId = message.photo[photoIndex].file_id;
      const cleanCaption = stripBotMention(caption) || "Analyze this image in detail";

      await sendTelegram("AURA tengah analyze gambar... 👁️", { chatId });

      const fileResult = await downloadTelegramFile(fileId);
      if (!fileResult || !fileResult.base64) {
        await sendTelegram("Tak dapat download gambar. Cuba hantar lagi?", { chatId });
        return res.sendStatus(200);
      }

      const result = await runOrchestrator(
        "Analyze this image. User says: " + cleanCaption + ". Image provided as base64.",
        {
          source: "telegram",
          userName,
          chatId,
          imageBase64: fileResult.base64,
          imageUrl: fileResult.url,
          isGroup,
        }
      );

      const text =
        typeof result === "string"
          ? result
          : (result && (result.response || result.result)) || JSON.stringify(result);

      await sendSmartResponse(chatId, text);
      return res.sendStatus(200);
    }

    // === TEXT messages ===
    if (!message.text) return res.sendStatus(200);

    const rawText = message.text;
    if (isGroup && !isBotMentioned(rawText, message)) return res.sendStatus(200);

    const userText = isGroup ? stripBotMention(rawText) : rawText;

    await sendTelegramTyping(chatId);
    await sendTelegram("AURA sedang fikir...", { chatId });

    const result = await runOrchestrator(userText, {
      source: "telegram",
      userName,
      chatId,
      isGroup,
      groupName: message.chat.title || "",
    });

    const responseText =
      typeof result === "string"
        ? result
        : (result && (result.response || result.result)) || JSON.stringify(result);

    await sendSmartResponse(chatId, responseText);
    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.sendStatus(200);
  }
});

// === Direct Task API ===
app.post("/task", async (req, res) => {
  try {
    const task = req.body.task;
    const context = req.body.context || {};
    if (!task) return res.status(400).json({ error: "Task required" });

    const result = await runOrchestrator(task, context);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// === Direct Tool Access ===
app.post("/tool/:toolName", async (req, res) => {
  try {
    const tool = TOOLS[req.params.toolName];
    if (!tool) return res.status(404).json({ error: "Not found", available: Object.keys(TOOL_DESCRIPTIONS) });

    const result = await tool.apply(null, Object.values(req.body));
    return res.json({ success: true, tool: req.params.toolName, result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// === Start ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log("===================================");
  console.log("AURA - ROOT index.js running");
  console.log("Port:", PORT);
  console.log("===================================");

  if (TELEGRAM_BOT_TOKEN) {
    try {
      const url = process.env.TELEGRAM_WEBHOOK_URL || "https://web-production-9224c.up.railway.app/telegram";
      const resp = await fetch(TELEGRAM_API + "/setWebhook?url=" + encodeURIComponent(url));
      const data = await resp.json();
      if (data.ok) console.log("Webhook:", url);
      else console.error("Webhook failed:", data.description);
    } catch (err) {
      console.error("Webhook error:", err.message);
    }
  }
});
