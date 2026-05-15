// agents/coding.js

export async function codingAgent(task, logs = "", context = {}) {

  console.log("💻 CODING AGENT ACTIVATED");

  return `
[CODING AGENT ANALYSIS]

TASK:
${task}

LOGS:
${logs || "No logs provided"}

CONTEXT:
${JSON.stringify(context, null, 2)}

POSSIBLE ISSUES:
- Invalid API response
- Missing environment variables
- Wrong endpoint
- JSON parsing issue
- OpenRouter model mismatch
- Telegram image sending failure
- Timeout or rate limit
- Invalid response handling
- Missing permissions
- Model not supporting requested modality

DEBUGGING CHECKLIST:
✅ Verify OPENROUTER_API_KEY exists
✅ Verify model name is correct
✅ Verify API endpoint is reachable
✅ Verify response contains valid data
✅ Verify Telegram bot token works
✅ Verify image URL exists before sending
✅ Verify Railway environment variables
✅ Check for undefined/null values
✅ Check logs for exact error stack

SUGGESTED FIX:
1. Check OpenRouter response structure
2. Validate API payload before sending
3. Add try/catch around external API calls
4. Add console logs before and after API calls
5. Ensure selected model supports requested modality
6. Fallback to cheaper/stable model if failed

RECOMMENDED ACTION:
- Use proper logging
- Retry failed requests
- Add fallback models
- Separate image/text logic
- Add response validation layer

SYSTEM IMPROVEMENT IDEAS:
✅ Dynamic model routing
✅ Auto fallback models
✅ Cost optimization
✅ Automatic retry handling
✅ AI self-debugging
✅ Health monitoring
✅ Tool validation layer

END OF ANALYSIS
`;
}
