import express from "express";
import dotenv from "dotenv";
import { runOrchestrator, callN8nWorkflow } from "./orchestrator.js";

dotenv.config();

const app = express();
app.use(express.json());

// === Config ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// === Helper: Send message to Telegram (with auto-fallback) ===
async function sendTelegram(chatId, text) {
  if (!text || !chatId) return;

  const MAX_LENGTH = 4000;

  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.substring(0, MAX_LENGTH));
    remaining = remaining.substring(MAX_LENGTH);
  }

  for (const chunk of chunks) {
    try {
      const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        console.error("Telegram send failed:", result.description);

        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk.substring(0, 500) + "\n\n[mesej dipendekkan]",
          }),
        });
      }
    } catch (err) {
      console.error("Telegram send error:", err.message);
    }
  }
}

// === Health check ===
app.get("/", (req, res) => {
  res.json({
    status: "AURA is alive",
    version: "3.1.0",
    agents: ["content", "finance", "sales", "marketing", "training", "ops", "architect"],
    n8n: process.env.N8N_WEBHOOK_URL ? "connected" : "not configured",
    timestamp: new Date().toISOString(),
  });
});

// === TELEGRAM WEBHOOK ===
app.post("/telegram", async (req, res) => {
  try {
    const message = req.body.message || req.body.edited_message;
    if (!message || !message.text) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const userText = message.text;
    const userName = message.from?.first_name || "User";

    console.log("\n=== TELEGRAM MESSAGE ===");
    console.log("From:", userName);
    console.log("Text:", userText);
    console.log("========================\n");

    await sendTelegram(chatId, "AURA sedang fikir...");

    const result = await runOrchestrator(userText, {
      source: "telegram",
      userName: userName,
      chatId: chatId,
    });

    const responseText =
      typeof result === "string"
        ? result
        : result?.response || result?.result || JSON.stringify(result);

    await sendTelegram(chatId, responseText);

    console.log("Response sent to Telegram");
    res.sendStatus(200);
  } catch (err) {
    console.error("Telegram webhook error:", err.message);

    const chatId = req.body?.message?.chat?.id;
    if (chatId) {
      await sendTelegram(chatId, "Alamak ada glitch kejap. Cuba lagi ya!");
    }
    res.sendStatus(200);
  }
});

// === Task endpoint (for API/n8n calls) ===
app.post("/task", async (req, res) => {
  try {
    const { task, context, priority } = req.body;
    if (!task) {
      return res.status(400).json({ error: "Task is required" });
    }

    console.log("\n=== TASK RECEIVED ===");
    console.log("Task:", task);
    console.log("=====================\n");

    const result = await runOrchestrator(task, { ...context, priority });
    res.json({ success: true, result });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// === n8n trigger endpoint ===
app.post("/n8n/trigger", async (req, res) => {
  try {
    const { webhookUrl, payload } = req.body;
    const result = await callN8nWorkflow(webhookUrl, payload);
    res.json({ success: true, result });
  } catch (err) {
    console.error("n8n trigger error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// === Webhook for n8n callbacks ===
app.post("/webhook/:source", async (req, res) => {
  const { source } = req.params;
  console.log("Webhook from", source);
  const result = await runOrchestrator(
    "webhook from " + source + ": " + JSON.stringify(req.body)
  );
  res.json({ received: true, result });
});

// === Agent status endpoint ===
app.get("/agents", (req, res) => {
  res.json({
    boss: "AURA Orchestrator v3.1",
    agents: [
      { name: "content", role: "Chat, copywriting, captions, scripts (DEFAULT)" },
      { name: "finance", role: "Pricing, costs, invoicing, ROI" },
      { name: "sales", role: "Customer replies, quotations, CRM" },
      { name: "marketing", role: "Ads strategy, campaigns, analytics" },
      { name: "training", role: "SOPs, training modules, quizzes" },
      { name: "ops", role: "Operations, scheduling, logistics" },
      { name: "architect", role: "System design, debugging, tech" },
    ],
  });
});

// === Start Server ===
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("===================================");
  console.log("AURA v3.1 running on port " + PORT);
  console.log("LLM: " + (process.env.OPENROUTER_MODEL || "not set"));
  console.log("n8n: " + (process.env.N8N_WEBHOOK_URL || "not configured"));
  console.log("7 Agents ready");
  console.log("===================================");

  if (TELEGRAM_BOT_TOKEN) {
    try {
      const webhookUrl = "https://web-production-9224c.up.railway.app/telegram";
      const resp = await fetch(
        TELEGRAM_API + "/setWebhook?url=" + encodeURIComponent(webhookUrl)
      );
      const data = await resp.json();
      if (data.ok) {
        console.log("Telegram webhook:", webhookUrl);
      } else {
        console.error("Telegram webhook failed:", data.description);
      }
    } catch (err) {
      console.error("Telegram webhook error:", err.message);
    }
  } else {
    console.log("WARNING: TELEGRAM_BOT_TOKEN not set");
  }
});
