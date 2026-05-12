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
