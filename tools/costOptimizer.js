// tools/costOptimizer.js
// AURA Cost Optimization Engine v1.0

const COST_CONFIG = {
  // === TOKEN LIMITS ===
  maxTokens: {
    simple: 500,        // casual chat, greetings
    moderate: 1500,     // content, captions, summaries
    complex: 3000,      // coding, architecture, analysis
    image: 1024,        // image generation prompts
  },

  // === CONTEXT WINDOW ===
  context: {
    maxHistory: 5,              // conversation.slice(-5)
    maxMemoryItems: 10,         // top 10 relevant memories
    maxSystemPromptTokens: 500, // compress system prompt
    summarizeAfter: 8,          // auto-summarize after 8 messages
  },

  // === MODEL ROUTING (cost per 1M tokens) ===
  models: {
    ultra_cheap: {
      id: 'google/gemini-2.5-flash',
      inputCost: 0.15,
      outputCost: 0.60,
      use: ['greeting', 'simple_qa', 'classification', 'planner']
    },
    cheap: {
      id: 'openai/gpt-4o-mini',
      inputCost: 0.15,
      outputCost: 0.60,
      use: ['summarize', 'format', 'translate', 'hashtags']
    },
    medium: {
      id: 'google/gemini-2.5-flash',
      inputCost: 0.15,
      outputCost: 0.60,
      use: ['content', 'caption', 'research_light', 'marketing']
    },
    premium: {
      id: 'anthropic/claude-sonnet-4',
      inputCost: 3.00,
      outputCost: 15.00,
      use: ['coding', 'architecture', 'complex_analysis', 'debugging']
    },
    image: {
      id: 'google/gemini-2.0-flash-exp',
      inputCost: 0.10,
      outputCost: 0.40,
      use: ['image_generation', 'image_analysis']
    }
  },

  // === DAILY BUDGET ===
  budget: {
    dailyLimit: 0.50,      // USD per day
    warningAt: 0.35,       // warn at 70%
    hardStopAt: 0.50,      // stop at 100%
    alertTelegram: true,   // alert via Telegram
  }
};

// === TASK CLASSIFIER ===
function classifyTask(message) {
  const msg = message.toLowerCase();

  // Simple / Greeting
  const simplePatterns = [
    /^(hi|hello|hey|assalam|salam|test|ping)/,
    /^(thanks|terima kasih|ok|okay|cun|nice)/,
    /apa khabar/,
    /^.{1,20}$/  // very short messages
  ];

  // Complex patterns
  const complexPatterns = [
    /code|coding|debug|fix|error|bug|deploy/,
    /architect|design|system|infrastructure/,
    /analys|complex|optimize|refactor/,
    /function|class|module|api|endpoint/
  ];

  // Image patterns
  const imagePatterns = [
    /gambar|image|photo|picture|generate.*image/,
    /design|poster|logo|banner|visual/
  ];

  // Content patterns
  const contentPatterns = [
    /caption|content|post|hashtag|copywriting/,
    /instagram|facebook|twitter|threads|tiktok/,
    /marketing|promote|campaign/
  ];

  for (const p of simplePatterns) {
    if (p.test(msg)) return 'simple';
  }
  for (const p of imagePatterns) {
    if (p.test(msg)) return 'image';
  }
  for (const p of complexPatterns) {
    if (p.test(msg)) return 'complex';
  }
  for (const p of contentPatterns) {
    if (p.test(msg)) return 'content';
  }

  return 'moderate'; // default
}

// === GET OPTIMAL MODEL ===
function getOptimalModel(taskType) {
  const mapping = {
    'simple': COST_CONFIG.models.ultra_cheap,
    'greeting': COST_CONFIG.models.ultra_cheap,
    'planner': COST_CONFIG.models.ultra_cheap,
    'moderate': COST_CONFIG.models.medium,
    'content': COST_CONFIG.models.medium,
    'marketing': COST_CONFIG.models.medium,
    'complex': COST_CONFIG.models.premium,
    'coding': COST_CONFIG.models.premium,
    'image': COST_CONFIG.models.image,
  };

  return mapping[taskType] || COST_CONFIG.models.cheap;
}

// === GET MAX TOKENS ===
function getMaxTokens(taskType) {
  const mapping = {
    'simple': COST_CONFIG.maxTokens.simple,
    'greeting': COST_CONFIG.maxTokens.simple,
    'moderate': COST_CONFIG.maxTokens.moderate,
    'content': COST_CONFIG.maxTokens.moderate,
    'complex': COST_CONFIG.maxTokens.complex,
    'coding': COST_CONFIG.maxTokens.complex,
    'image': COST_CONFIG.maxTokens.image,
  };

  return mapping[taskType] || COST_CONFIG.maxTokens.moderate;
}

// === COMPRESS CONTEXT ===
function compressContext(messages, taskType) {
  const maxHistory = COST_CONFIG.context.maxHistory;

  if (!messages || messages.length === 0) return [];

  // Always keep system message (first)
  const systemMsg = messages.find(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  // Slice to last N messages
  const sliced = nonSystem.slice(-maxHistory);

  // Compress old messages into summary if too many
  const result = [];
  if (systemMsg) {
    // Trim system prompt if too long
    const trimmedSystem = {
      ...systemMsg,
      content: typeof systemMsg.content === 'string' 
        ? systemMsg.content.substring(0, 2000) 
        : systemMsg.content
    };
    result.push(trimmedSystem);
  }

  result.push(...sliced);
  return result;
}

// === COMPRESS MEMORY ===
function compressMemory(memories) {
  if (!memories || memories.length === 0) return '';

  const maxItems = COST_CONFIG.context.maxMemoryItems;

  // Sort by relevance/recency, take top N
  const topMemories = memories.slice(-maxItems);

  // Compact format instead of verbose
  return topMemories.map(m => {
    if (typeof m === 'string') return m.substring(0, 200);
    if (m.content) return m.content.substring(0, 200);
    return JSON.stringify(m).substring(0, 200);
  }).join('\n');
}

// === ESTIMATE COST ===
function estimateCost(inputTokens, outputTokens, model) {
  const modelConfig = Object.values(COST_CONFIG.models)
    .find(m => m.id === model);

  if (!modelConfig) return 0;

  const inputCost = (inputTokens / 1_000_000) * modelConfig.inputCost;
  const outputCost = (outputTokens / 1_000_000) * modelConfig.outputCost;

  return inputCost + outputCost;
}

// === DAILY TRACKER ===
let dailySpend = 0;
let lastResetDate = new Date().toDateString();

function trackSpend(cost) {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailySpend = 0;
    lastResetDate = today;
  }
  dailySpend += cost;
  return {
    dailySpend,
    remaining: COST_CONFIG.budget.dailyLimit - dailySpend,
    isWarning: dailySpend >= COST_CONFIG.budget.warningAt,
    isOverBudget: dailySpend >= COST_CONFIG.budget.hardStopAt,
  };
}

function getDailySpend() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailySpend = 0;
    lastResetDate = today;
  }
  return {
    spent: dailySpend,
    limit: COST_CONFIG.budget.dailyLimit,
    remaining: COST_CONFIG.budget.dailyLimit - dailySpend,
    percentage: ((dailySpend / COST_CONFIG.budget.dailyLimit) * 100).toFixed(1)
  };
}

module.exports = {
  COST_CONFIG,
  classifyTask,
  getOptimalModel,
  getMaxTokens,
  compressContext,
  compressMemory,
  estimateCost,
  trackSpend,
  getDailySpend,
};
