import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { runOrchestrator } from "./orchestrator.js";
import {
  sendTelegram,
  sendTelegramImage,
  sendTelegramTyping,
  sendSmartResponse,
  downloadTelegramFile,
} from "./tools/telegram.js";
import { TOOLS, TOOL_DESCRIPTIONS } from "./tools/index.js";

var app = express();
app.use(express.json());

var TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
var TELEGRAM_API = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN;

// === Helper: Check if bot is mentioned ===
function isBotMentioned(text, message) {
  if (!text) return false;
  var lower = text.toLowerCase();
  if (lower.indexOf("@auraagentic") > -1) return true;
  if (lower.indexOf("aura") > -1) return true;
  if (message && message.reply_to_message && message.reply_to_message.from && message.reply_to_message.from.is_bot) return true;
  return false;
}

// === Helper: Strip bot mention from text ===
function stripBotMention(text) {
  if (!text) return text;
  return text
    .replace(/@auraagentic/gi, "")
    .replace(/^aura[,:]?\s*/i, "")
    .trim();
}

// === Helper: Check if group chat ===
function isGroupChat(message) {
  return message.chat.type === "group" || message.chat.type === "supergroup";
}

// === Health ===
app.get("/", function(req, res) {
  res.json({
    status: "AURA v4.0.1 - Autonomous AI Operating System",
    version: "4.0.1",
    agents: ["content", "finance", "sales", "marketing", "training", "ops", "architect", "coding"],
    tools: Object.keys(TOOL_DESCRIPTIONS),
  });
});

// === Telegram Webhook ===
app.post("/telegram", async function(req, res) {
  try {
    var message = req.body.message || req.body.edited_message;
    if (!message) return res.sendStatus(200);

    var chatId = message.chat.id;
    var userName = (message.from && message.from.first_name) ? message.from.first_name : "User";
    var isGroup = isGroupChat(message);

    // === PHOTO MESSAGES ===
    if (message.photo) {
      var caption = message.caption || "";

      if (isGroup && !isBotMentioned(caption, message)) {
        console.log("[Group] Silent photo read from:", userName);
        return res.sendStatus(200);
      }

      var photoIndex = Math.min(2, message.photo.length - 1);
      var fileId = message.photo[photoIndex].file_id;
      var cleanCaption = stripBotMention(caption) || "Analyze this image in detail";

      console.log("");
      console.log("=== PHOTO ===");
      console.log("From:", userName, isGroup ? "| Group:" + message.chat.title : "| DM");
      console.log("Caption:", cleanCaption);

      await sendTelegram("AURA tengah analyze gambar... \xF0\x9F\x91\x81", { chatId: chatId });

      var fileResult = await downloadTelegramFile(fileId);

      if (fileResult.base64) {
        console.log("[Photo] Downloaded, sending to vision AI...");

        var result = await runOrchestrator(
          "Analyze this image. User says: " + cleanCaption + ". Image provided as base64.",
          {
            source: "telegram",
            userName: userName,
            chatId: chatId,
            imageBase64: fileResult.base64,
            imageUrl: fileResult.url,
            isGroup: isGroup,
          }
        );

        var text = "";
        if (typeof result === "string") { text = result; }
        else { text = (result && result.response) || (result && result.result) || JSON.stringify(result); }

        await sendSmartResponse(chatId, text);
      } else {
        await sendTelegram("Tak dapat download gambar. Cuba hantar lagi?", { chatId: chatId });
      }
      return res.sendStatus(200);
    }

    // === TEXT MESSAGES ===
    if (!message.text) return res.sendStatus(200);
    var rawText = message.text;

    if (isGroup && !isBotMentioned(rawText, message)) {
      console.log("[Group] Silent read from " + userName + ": " + rawText.substring(0, 50));
      return res.sendStatus(200);
    }

    var userText = isGroup ? stripBotMention(rawText) : rawText;

    console.log("");
    console.log("=== TELEGRAM ===");
    console.log("From:", userName, isGroup ? "| Group:" + message.chat.title : "| DM");
    console.log("Text:", userText);

    await sendTelegramTyping(chatId);
    await sendTelegram("AURA sedang fikir...", { chatId: chatId });

    var result = await runOrchestrator(userText, {
      source: "telegram",
      userName: userName,
      chatId: chatId,
      isGroup: isGroup,
      groupName: (message.chat.title || ""),
    });

    var responseText = "";
    if (typeof result === "string") { responseText = result; }
    else { responseText = (result && result.response) || (result && result.result) || JSON.stringify(result); }

    // SMART RESPONSE: auto-detect base64 image, URL image, or text
    await sendSmartResponse(chatId, responseText);

    console.log("Response sent");
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.message);
    var chatId2 = req.body && req.body.message && req.body.message.chat && req.body.message.chat.id;
    if (chatId2) { await sendTelegram("Alamak ada glitch. Cuba lagi!", { chatId: chatId2 }); }
    res.sendStatus(200);
  }
});

// === Task API ===
app.post("/task", async function(req, res) {
  try {
    var task = req.body.task;
    var context = req.body.context || {};
    if (!task) return res.status(400).json({ error: "Task required" });
    var result = await runOrchestrator(task, context);
    res.json({ success: true, result: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Direct Tool Access ===
app.post("/tool/:toolName", async function(req, res) {
  try {
    var tool = TOOLS[req.params.toolName];
    if (!tool) return res.status(404).json({ error: "Not found", available: Object.keys(TOOL_DESCRIPTIONS) });
    var result = await tool.apply(null, Object.values(req.body));
    res.json({ success: true, tool: req.params.toolName, result: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Info ===
app.get("/agents", function(req, res) {
  res.json({
    boss: "AURA v4.0.1",
    agents: [
      { name: "content", role: "Chat, copywriting, captions (DEFAULT)" },
      { name: "finance", role: "Pricing, costs, ROI" },
      { name: "sales", role: "Customer replies, quotations" },
      { name: "marketing", role: "Ads, campaigns, research" },
      { name: "training", role: "SOPs, training materials" },
      { name: "ops", role: "Operations, scheduling" },
      { name: "architect", role: "Tech, debugging" },
      { name: "coding", role: "Code gen, debug, log analysis" },
    ],
    tools: TOOL_DESCRIPTIONS,
  });
});

app.get("/tools", function(req, res) { res.json({ tools: TOOL_DESCRIPTIONS }); });

// === Start ===
var PORT = process.env.PORT || 3000;
app.listen(PORT, async function() {
  console.log("===================================");
  console.log("AURA v4.0.1 - Autonomous AI OS");
  console.log("Port:", PORT);
  console.log("===================================");

  if (TELEGRAM_BOT_TOKEN) {
    try {
      var url = "https://web-production-9224c.up.railway.app/telegram";
      var resp = await fetch(TELEGRAM_API + "/setWebhook?url=" + encodeURIComponent(url));
      var data = await resp.json();
      if (data.ok) { console.log("Webhook:", url); }
      else { console.error("Webhook failed:", data.description); }
    } catch (err) {
      console.error("Webhook error:", err.message);
    }
  }
});
