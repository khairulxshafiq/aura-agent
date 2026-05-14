import express from "express";
import dotenv from "dotenv";
import { runOrchestrator } from "./orchestrator.js";

dotenv.config();

const app = express();
app.use(express.json());

// === Config ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// === Helper: Escape Telegram MarkdownV2 special characters ===
function escapeTelegramMd(text) {
  if (!text) return "";
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// === Helper: Send message to Telegram (with auto-fallback) ===
async function sendTelegram(chatId, text) {
  if (!text || !chatId) return;

  // Telegram max message length = 4096 characters
  const MAX_LENGTH = 4000;

  // Split long messages into chunks
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.substring(0, MAX_LENGTH));
    remaining = remaining.substring(MAX_LENGTH);
  }

  for (const chunk of chunks) {
    try {
      // Try sending as plain text first (most reliable)
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

        // Fallback: try sending a simplified version
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
    status: "AURA BOSS is alive",
    version: "3.0.0",
    agents: ["finance", "sales", "content", "marketing", "training", "ops", "architect"],
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

    // Send "thinking" indicator
    await sendTelegram(chatId, "AURA sedang fikir...");

    // Run orchestrator
    const result = await runOrchestrator(userText, {
      source: "telegram",
      userName: userName,
      chatId: chatId,
    });

    // Extract response text
    const responseText =
      typeof result === "string"
        ? result
        : result?.response || result?.result || JSON.stringify(result);

    // Send response back to Telegram
    await sendTelegram(chatId, responseText);

    console.log("Response sent to Telegram");
    res.sendStatus(200);
  } catch (err) {
    console.error("Telegram webhook error:", err.message);

    const chatId = req.body?.message?.chat?.id;
    if (chatId) {
      await sendTelegram(chatId, "Maaf, AURA ada masalah teknikal. Cuba lagi.");
    }
    res.sendStatus(200);
  }
});

// === Main task endpoint (for API/n8n calls) ===
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
    boss: "AURA Orchestrator",
    agents: [
      { name: "finance", role: "Invoice, resit, ROI, expense tracking" },
      { name: "sales", role: "Customer reply, CRM, quotation" },
      { name: "content", role: "Copywriting, caption, video script" },
      { name: "marketing", role: "Ads strategy, campaign, analytics" },
      { name: "training", role: "Module, slides, quiz, SOP" },
      { name: "ops", role: "Daily log, briefing, scheduling" },
      { name: "architect", role: "System upgrade, debug, optimization" },
    ],
  });
});

// === Start Server ===
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("===================================");
  console.log("AURA BOSS running on port " + PORT);
  console.log("LLM: " + (process.env.OPENROUTER_MODEL || "not set"));
  console.log("7 Agents ready");
  console.log("Telegram webhook path: /telegram");
  console.log("===================================");

  // Auto-register Telegram webhook on startup
  if (TELEGRAM_BOT_TOKEN) {
    try {
      const webhookUrl = "https://web-production-9224c.up.railway.app/telegram";
      const resp = await fetch(
        TELEGRAM_API + "/setWebhook?url=" + encodeURIComponent(webhookUrl)
      );
      const data = await resp.json();
      if (data.ok) {
        console.log("Telegram webhook registered:", webhookUrl);
      } else {
        console.error("Telegram webhook failed:", data.description);
      }
    } catch (err) {
      console.error("Telegram webhook setup error:", err.message);
    }
  } else {
    console.log("WARNING: TELEGRAM_BOT_TOKEN not set");
  }
});
