import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { runOrchestrator } from "./orchestrator.js";
import {
  sendTelegram,
  sendTelegramImage,
  sendTelegramTyping,
  downloadTelegramFile,
} from "./tools/telegram.js";
import { TOOLS, TOOL_DESCRIPTIONS } from "./tools/index.js";

const app = express();
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// === Health ===
app.get("/", (req, res) => {
  res.json({
    status: "AURA v3.2.1 — Full Agentic (Vision Fixed)",
    version: "3.2.1",
    agents: ["content", "finance", "sales", "marketing", "training", "ops", "architect"],
    tools: Object.keys(TOOL_DESCRIPTIONS),
    timestamp: new Date().toISOString(),
  });
});

// === Telegram Webhook ===
app.post("/telegram", async (req, res) => {
  try {
    const message = req.body.message || req.body.edited_message;
    if (!message) return res.sendStatus(200);

    const chatId = message.chat.id;
    const userName = message.from?.first_name || "User";

    // === PHOTO MESSAGES ===
    if (message.photo) {
      const fileId = message.photo[message.photo.length - 1].file_id;
      const caption = message.caption || "Analyze this image in detail";

      console.log("\n=== PHOTO ===");
      console.log("From:", userName, "| Caption:", caption);

      await sendTelegram("AURA tengah analyze gambar... 👁️", { chatId });

      // Download image as base64 (Gemini can't access Telegram URLs directly)
      const { url, base64 } = await downloadTelegramFile(fileId);

      if (base64) {
        console.log("[Photo] Image downloaded, sending to AI vision...");

        const result = await runOrchestrator(
          `Analyze this image. User says: "${caption}". The image has been provided as base64 data.`,
          {
            source: "telegram",
            userName,
            chatId,
            imageBase64: base64,
            imageUrl: url,
          }
        );

        const text = typeof result === "string"
          ? result
          : result?.response || result?.result || JSON.stringify(result);
        await sendTelegram(text, { chatId });
      } else {
        await sendTelegram("Tak dapat download gambar tu. Cuba hantar lagi? 🙏", { chatId });
      }
      return res.sendStatus(200);
    }

    // === TEXT MESSAGES ===
    if (!message.text) return res.sendStatus(200);
    const userText = message.text;

    console.log("\n=== TELEGRAM ===");
    console.log("From:", userName, "| Text:", userText);

    await sendTelegramTyping(chatId);
    await sendTelegram("AURA sedang fikir...", { chatId });

    const result = await runOrchestrator(userText, {
      source: "telegram",
      userName,
      chatId,
    });

    const responseText = typeof result === "string"
      ? result
      : result?.response || result?.result || JSON.stringify(result);

    // Auto-detect image URLs in response and send as photo
    const imgMatch = responseText.match(/(https:\/\/[^\s]+(replicate\.delivery|webp|png|jpg)[^\s]*)/i);
    if (imgMatch) {
      const cleanText = responseText.replace(imgMatch[0], "").trim();
      await sendTelegramImage(imgMatch[0], cleanText.substring(0, 200), { chatId });
    } else {
      await sendTelegram(responseText, { chatId });
    }

    console.log("Response sent");
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.message);
    const chatId = req.body?.message?.chat?.id;
    if (chatId) await sendTelegram("Alamak ada glitch. Cuba lagi! 🙏", { chatId });
    res.sendStatus(200);
  }
});

// === Task API ===
app.post("/task", async (req, res) => {
  try {
    const { task, context } = req.body;
    if (!task) return res.status(400).json({ error: "Task required" });
    const result = await runOrchestrator(task, context || {});
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Direct Tool Access ===
app.post("/tool/:toolName", async (req, res) => {
  try {
    const tool = TOOLS[req.params.toolName];
    if (!tool) return res.status(404).json({ error: "Tool not found", available: Object.keys(TOOL_DESCRIPTIONS) });
    const result = await tool(...Object.values(req.body));
    res.json({ success: true, tool: req.params.toolName, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Info ===
app.get("/agents", (req, res) => {
  res.json({
    boss: "AURA v3.2.1",
    agents: [
      { name: "content", role: "Chat, copywriting, captions, visuals (DEFAULT)" },
      { name: "finance", role: "Pricing, costs, ROI" },
      { name: "sales", role: "Customer replies, quotations" },
      { name: "marketing", role: "Ads, campaigns, research" },
      { name: "training", role: "SOPs, training materials" },
      { name: "ops", role: "Operations, scheduling" },
      { name: "architect", role: "Tech, debugging" },
    ],
    tools: TOOL_DESCRIPTIONS,
  });
});

app.get("/tools", (req, res) => res.json({ tools: TOOL_DESCRIPTIONS }));

// === Start ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log("===================================");
  console.log("AURA v3.2.1 — Vision Fixed");
  console.log("Port:", PORT);
  console.log("LLM:", process.env.OPENROUTER_MODEL || "not set");
  console.log("Tools:", Object.keys(TOOL_DESCRIPTIONS).join(", "));
  console.log("===================================");

  if (TELEGRAM_BOT_TOKEN) {
    try {
      const url = "https://web-production-9224c.up.railway.app/telegram";
      const resp = await fetch(TELEGRAM_API + "/setWebhook?url=" + encodeURIComponent(url));
      const data = await resp.json();
      if (data.ok) console.log("Telegram webhook:", url);
      else console.error("Webhook failed:", data.description);
    } catch (err) {
      console.error("Webhook error:", err.message);
    }
  }
});
