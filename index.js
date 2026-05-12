import express from "express";
import dotenv from "dotenv";
import { runOrchestrator } from "./orchestrator.js";

dotenv.config();

const app = express();
app.use(express.json());

// ═══ Config ═══
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ═══ Helper: Send message to Telegram ═══
async function sendTelegram(chatId, text) {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown"
      })
    });
  } catch (err) {
    console.error("❌ Telegram send error:", err.message);
  }
}

// ═══ Health check ═══
app.get("/", (req, res) => {
  res.json({
    status: "🧠 AURA BOSS is alive",
    version: "3.0.0",
    agents: ["finance", "sales", "content", "marketing", "training", "ops", "architect"],
    timestamp: new Date().toISOString()
  });
});

// ═══ TELEGRAM WEBHOOK ═══
app.post("/telegram", async (req, res) => {
  try {
    const message = req.body.message || req.body.edited_message;
    if (!message || !message.text) {
      return res.sendStatus(200); // Ignore non-text updates
    }

    const chatId = message.chat.id;
    const userText = message.text;
    const userName = message.from?.first_name || "User";

    console.log("\n🧠 ═══════════════════════════════════");
    console.log(`📩 Telegram from ${userName}: ${userText}`);
    console.log("═══════════════════════════════════\n");

    // Send "thinking" indicator
    await sendTelegram(chatId, "🧠 AURA sedang fikir...");

    // Run orchestrator
    const result = await runOrchestrator(userText, {
      source: "telegram",
      userName: userName,
      chatId: chatId
    });

    // Extract response text
    const responseText = typeof result === "string"
      ? result
      : result?.response || result?.result || JSON.stringify(result);

    // Send response back to Telegram
    await sendTelegram(chatId, responseText);

    console.log("✅ Response sent to Telegram");
    res.sendStatus(200);

  } catch (err) {
    console.error("❌ Telegram webhook error:", err.message);
    
    // Try to notify user about error
    const chatId = req.body?.message?.chat?.id;
    if (chatId) {
      await sendTelegram(chatId, "⚠️ Maaf, AURA ada masalah teknikal. Cuba lagi.");
    }
    res.sendStatus(200); // Always return 200 to Telegram
  }
});

// ═══ Main task endpoint (for API/n8n calls) ═══
app.post("/task", async (req, res) => {
  try {
    const { task, context, priority } = req.body;
    if (!task) return res.status(400).json({ error: "Task is required" });

    console.log("\n🧠 ═══════════════════════════════════");
    console.log("📥 BOSS received task:", task);
    console.log("═══════════════════════════════════\n");

    const result = await runOrchestrator(task, { ...context, priority });
    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══ Webhook for n8n callbacks ═══
app.post("/webhook/:source", async (req, res) => {
  const { source } = req.params;
  console.log(`📡 Webhook from ${source}`);
  const result = await runOrchestrator(`webhook from ${source}: ${JSON.stringify(req.body)}`);
  res.json({ received: true, result });
});

// ═══ Agent status endpoint ═══
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
      { name: "architect", role: "System upgrade, debug, optimization" }
    ]
  });
});

// ═══ Start Server ═══
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log("🧠 ═══════════════════════════════════");
  console.log(`✅ AURA BOSS running on port ${PORT}`);
