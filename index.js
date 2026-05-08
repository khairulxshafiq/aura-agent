import express from "express";
import dotenv from "dotenv";
import { runOrchestrator } from "./orchestrator.js";

dotenv.config();

const app = express();
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "\uD83E\uDDE0 AURA BOSS is alive",
    version: "3.0.0",
    agents: ["finance", "sales", "content", "marketing", "training", "ops", "architect"],
    timestamp: new Date().toISOString()
  });
});

// Main task endpoint
app.post("/task", async (req, res) => {
  try {
    const { task, context, priority } = req.body;
    if (!task) return res.status(400).json({ error: "Task is required" });

    console.log("\n\uD83E\uDDE0 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    console.log("\uD83D\uDCE5 BOSS received task:", task);
    console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");

    const result = await runOrchestrator(task, { ...context, priority });
    res.json({ success: true, result });
  } catch (err) {
    console.error("\u274C Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Webhook for n8n / Telegram callbacks
app.post("/webhook/:source", async (req, res) => {
  const { source } = req.params;
  console.log(`\uD83D\uDCE1 Webhook from ${source}`);
  const result = await runOrchestrator(`webhook from ${source}: ${JSON.stringify(req.body)}`);
  res.json({ received: true, result });
});

// Agent status endpoint
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("\uD83E\uDDE0 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log(`\u2705 AURA BOSS running on port ${PORT}`);
  console.log(`\uD83E\uDD16 LLM: ${process.env.OPENROUTER_MODEL}`);
  console.log("\uD83D\uDC65 7 Agents ready");
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
});
