import { askLLM } from "../llm.js";
import { sendTelegram } from "../tools/telegram.js";
import { triggerN8n } from "../tools/n8n.js";
import { supabaseInsert, supabaseQuery } from "../tools/supabase.js";

export async function opsAgent(step) {
  const { action, params = {} } = step;
  console.log(`Ops Agent: ${action}`);

  switch (action) {
    case "daily_log": {
      const log = {
        date: new Date().toISOString(),
        activities: params.activities || [],
        notes: params.notes || "",
        status: params.status || "completed"
      };
      await supabaseInsert("daily_logs", log);
      const summary = await askLLM(`
        Summarize this daily log entry briefly:
        ${JSON.stringify(log)}
      `, { maxTokens: 150 });
      return { log, summary, saved: true };
    }

    case "daily_briefing": {
      const recentLogs = await supabaseQuery("daily_logs", { order: "date", limit: 7 });
      const pendingTasks = await supabaseQuery("tasks", { filter: { status: "pending" }, limit: 10 });
      const briefing = await askLLM(`
        Generate a daily briefing:
        Recent logs: ${JSON.stringify(recentLogs)}
        Pending tasks: ${JSON.stringify(pendingTasks)}
        Today's date: ${new Date().toISOString()}
        Include: yesterday summary, today's priorities, reminders, blockers.
      `, { maxTokens: 500 });
      if (params.sendTelegram !== false) {
        await sendTelegram(`AURA Daily Briefing\n\n${briefing}`);
      }
      return { briefing };
    }

    case "schedule_task": {
      const task = await supabaseInsert("tasks", {
        title: params.title,
        description: params.description,
        assigned_to: params.assignedTo || "self",
        due_date: params.dueDate,
        priority: params.priority || "medium",
        status: "pending",
        created_at: new Date().toISOString()
      });
      return { scheduled: true, task };
    }

    case "task_status": {
      const tasks = await supabaseQuery("tasks", { order: "created_at", limit: params.limit || 20 });
      const report = await askLLM(`
        Generate task status report:
        Tasks: ${JSON.stringify(tasks)}
        Group by status. Highlight overdue items.
      `, { maxTokens: 500 });
      return { report, tasks };
    }

    case "trigger_automation": {
      const result = await triggerN8n({
        type: "ops",
        action: params.n8nAction || "general",
        data: params
      });
      return result;
    }

    case "handle_general": {
      const response = await askLLM(`
        Handle this operations task:
        ${params.task || JSON.stringify(params)}
        Provide a clear, actionable response.
      `, { maxTokens: 500 });
      return { response };
    }

    default: {
      const response = await askLLM(
        `You are an operations manager. Handle: ${action}. Details: ${JSON.stringify(params)}`,
        { maxTokens: 500 }
      );
      return { response };
    }
  }
}
