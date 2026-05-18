// tools/costOptimizer.js
// AURA Cost Optimization Engine v1.0 (ESM)

export const COST_CONFIG = {
  maxTokens: {
    simple: 500,
    moderate: 1500,
    complex: 3000,
    image: 1024,
  },
  context: {
    maxHistory: 5,
    maxMemoryItems: 10,
    maxSystemPromptTokens: 500,
    summarizeAfter: 8,
  },
  models: {
    ultra_cheap: { id: 'google/gemini-2.5-flash', inputCost: 0.15, outputCost: 0.60, use: ['greeting', 'simple_qa', 'classification', 'planner'] },
    cheap: { id: 'openai/gpt-4o-mini', inputCost: 0.15, outputCost: 0.60, use: ['summarize', 'format', 'translate', 'hashtags'] },
    medium: { id: 'google/gemini-2.5-flash', inputCost: 0.15, outputCost: 0.60, use: ['content', 'caption', 'research_light', 'marketing'] },
    premium: { id: 'anthropic/claude-sonnet-4', inputCost: 3.00, outputCost: 15.00, use: ['coding', 'architecture', 'complex_analysis', 'debugging'] },
    image: { id: 'google/gemini-2.0-flash-exp', inputCost: 0.10, outputCost: 0.40, use: ['image_generation', 'image_analysis'] }
  },
  budget: { dailyLimit: 0.50, warningAt: 0.35, hardStopAt: 0.50, alertTelegram: true }
};

export function classifyTask(message) {
  const msg = message.toLowerCase();
  const simplePatterns = [/^(hi|hello|hey|assalam|salam|test|ping)/, /^(thanks|terima kasih|ok|okay|cun|nice)/, /apa khabar/, /^.{1,20}$/];
  const complexPatterns = [/code|coding|debug|fix|error|bug|deploy/, /architect|design|system|infrastructure/, /analys|complex|optimize|refactor/, /function|class|module|api|endpoint/];
  const imagePatterns = [/gambar|image|photo|picture|generate.*image/, /design|poster|logo|banner|visual/];
  const contentPatterns = [/caption|content|post|hashtag|copywriting/, /instagram|facebook|twitter|threads|tiktok/, /marketing|promote|campaign/];
  for (const p of simplePatterns) { if (p.test(msg)) return 'simple'; }
  for (const p of imagePatterns) { if (p.test(msg)) return 'image'; }
  for (const p of complexPatterns) { if (p.test(msg)) return 'complex'; }
  for (const p of contentPatterns) { if (p.test(msg)) return 'content'; }
  return 'moderate';
}

export function getOptimalModel(taskType) {
  const mapping = { 'simple': COST_CONFIG.models.ultra_cheap, 'greeting': COST_CONFIG.models.ultra_cheap, 'planner': COST_CONFIG.models.ultra_cheap, 'moderate': COST_CONFIG.models.medium, 'content': COST_CONFIG.models.medium, 'marketing': COST_CONFIG.models.medium, 'complex': COST_CONFIG.models.premium, 'coding': COST_CONFIG.models.premium, 'image': COST_CONFIG.models.image };
  return mapping[taskType] || COST_CONFIG.models.cheap;
}

export function getMaxTokens(taskType) {
  const mapping = { 'simple': COST_CONFIG.maxTokens.simple, 'greeting': COST_CONFIG.maxTokens.simple, 'moderate': COST_CONFIG.maxTokens.moderate, 'content': COST_CONFIG.maxTokens.moderate, 'complex': COST_CONFIG.maxTokens.complex, 'coding': COST_CONFIG.maxTokens.complex, 'image': COST_CONFIG.maxTokens.image };
  return mapping[taskType] || COST_CONFIG.maxTokens.moderate;
}

export function compressContext(messages, taskType) {
  const maxHistory = COST_CONFIG.context.maxHistory;
  if (!messages || messages.length === 0) return [];
  const systemMsg = messages.find(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');
  const sliced = nonSystem.slice(-maxHistory);
  const result = [];
  if (systemMsg) { result.push({ ...systemMsg, content: typeof systemMsg.content === 'string' ? systemMsg.content.substring(0, 2000) : systemMsg.content }); }
  result.push(...sliced);
  return result;
}

export function compressMemory(memories) {
  if (!memories || memories.length === 0) return '';
  const topMemories = memories.slice(-COST_CONFIG.context.maxMemoryItems);
  return topMemories.map(m => { if (typeof m === 'string') return m.substring(0, 200); if (m.content) return m.content.substring(0, 200); return JSON.stringify(m).substring(0, 200); }).join('\n');
}

export function estimateCost(inputTokens, outputTokens, model) {
  const modelConfig = Object.values(COST_CONFIG.models).find(m => m.id === model);
  if (!modelConfig) return 0;
  return (inputTokens / 1_000_000) * modelConfig.inputCost + (outputTokens / 1_000_000) * modelConfig.outputCost;
}

let dailySpend = 0;
let lastResetDate = new Date().toDateString();

export function trackSpend(cost) {
  const today = new Date().toDateString();
  if (today !== lastResetDate) { dailySpend = 0; lastResetDate = today; }
  dailySpend += cost;
  return { dailySpend, remaining: COST_CONFIG.budget.dailyLimit - dailySpend, isWarning: dailySpend >= COST_CONFIG.budget.warningAt, isOverBudget: dailySpend >= COST_CONFIG.budget.hardStopAt };
}

export function getDailySpend() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) { dailySpend = 0; lastResetDate = today; }
  return { spent: dailySpend, limit: COST_CONFIG.budget.dailyLimit, remaining: COST_CONFIG.budget.dailyLimit - dailySpend, percentage: ((dailySpend / COST_CONFIG.budget.dailyLimit) * 100).toFixed(1) };
}
