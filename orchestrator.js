import { planTask } from "./planner.js";
import { runAgentLoop } from "./agentLoop.js";
import { saveMemory, getRelevantMemory } from "./memory/memory.js";
import { askLLM } from "./llm.js";

export async function runOrchestrator(task, context = {}) {
  const startTime = Date.now();

  console.log("AURA BOSS START");
  console.log("Task:", task);
  console.log("Time:", new Date().toISOString());

  // STEP 1: Boss understands the task
  console.log("\nStep 1: Understanding task...");
  const understanding = await askLLM(`
    Analyze this task briefly (2-3 lines):
    "${task}"
    
    What is the user really asking? What's the expected output?
  `, { maxTokens: 200 });
  console.log("Understanding:", understanding);

  // STEP 2: Recall memory
  console.log("\nStep 2: Checking memory...");
  const memory = await getRelevantMemory(task);
  console.log(`Found ${memory.length} relevant memories`);

  // STEP 3: Plan (LLM decides which agents + steps)
  console.log("\nStep 3: Planning...");
  const plan = await planTask(task, { ...context, memory, understanding });
  console.log("Plan:", JSON.stringify(plan, null, 2));

  // STEP 4: Execute via Agent Loop
  console.log("\nStep 4: Executing...");
  const results = await runAgentLoop(plan, task);

  // STEP 5: Boss reviews results
  console.log("\nStep 5: Boss reviewing...");
  const review = await askLLM(`
    You are AURA Boss. Review these results for task: "${task}"
    
    Results: ${JSON.stringify(results, null, 2)}
    
    Give a brief summary (3-5 lines):
    - Was the task completed successfully?
    - Any issues or follow-ups needed?
    - Final output/answer for the user
  `, { maxTokens: 300 });

  // STEP 6: Save to memory
  console.log("\nStep 6: Saving memory...");
  await saveMemory({
    task,
    understanding,
    plan,
    results,
    review,
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString()
  });

  const output = {
    task,
    understanding,
    plan,
    results,
    review,
    duration_ms: Date.now() - startTime,
    timestamp: new Date().toISOString()
  };

  console.log("\nAURA BOSS COMPLETE");
  console.log(`Duration: ${output.duration_ms}ms`);

  return output;
}
