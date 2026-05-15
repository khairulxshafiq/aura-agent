import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { runOrchestrator } from "./orchestrator.js";
import { sendTelegram, sendTelegramImage, sendTelegramTyping, getTelegramFile } from "./tools/telegram.js";
import { TOOLS, TOOL_DESCRIPTIONS } from "./tools/index.js";

const app = express();
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// === Health ===
app.get("/", (req, res) => {
  res.json({
    status: "AURA v3.2 — Full Agentic (No n8n needed)",
    version: "3.2.0",
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

    // === Photo messages ===
    if (message.photo) {
      const fileId = message.photo[message.photo.length - 1].file_id;
      const caption = message.caption || "Analyze this image";

      console.log("\n=== PHOTO ===");
      console.log("From:", userName, "| Caption:", caption);

      await sendTelegram("AURA tengah analyze gambar... 👁️", { chatId });

      const fileUrl = await getTelegramFile(fileId);
      if (fileUrl) {
        const result = await runOrchestrator(`Analyze image: ${caption}. Image URL: ${fileUrl}`, {
          source: "telegram", userName, chatId, imageUrl: fileUrl,
        });
        const text = typeof result === "string" ? result : result?.response || result?.result || JSON.stringify(result);
        await sendTelegram(text, { chatId });
      } else {
        await sendTelegram("Tak dapat access gambar. Hantar lagi?", { chatId });
      }
      return res.sendStatus(200);
    }

    // === Text messages ===
    if (!message.text) return res.sendStatus(200);
    const userText = message.text;

    console.log("\n=== TELEGRAM ===");
    console.log("From:", userName, "| Text:", userText);

    await sendTelegram("AURA sedang fikir...", { chatId });

    const result = await runOrchestrator(userText, { source: "telegram", userName, chatId });
    const responseText = typeof result === "string" ? result : result?.response || result?.result || JSON.stringify(result);

    // If result contains image URL, send as photo
    if (responseText.includes("replicate.delivery") || responseText.includes(".webp") || responseText.includes(".png")) {
      const urlMatch = responseText.match(/(https:\/\/[^\s]+\.(webp|png|jpg))/);
      if (urlMatch) {
        await sendTelegramImage(urlMatch[0], responseText.replace(urlMatch[0], "").trim(), { chatId });
      } else {
        await sendTelegram(responseText, { chatId });
      }
    } else {
      await sendTelegram(responseText, { chatId });
    }

    console.log("Response sent");
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.message);
    const chatId = req.body?.message?.chat?.id;
    if (chatId) await sendTelegram("Alamak ada glitch. Cuba lagi!", { chatId });
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
    boss: "AURA v3.2",
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
  console.log("AURA v3.2 — Full Agentic System");
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
