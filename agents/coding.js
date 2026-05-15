export async function codingAgent(task) {

 return `
[CODING AGENT ANALYSIS]

Detected Issue:
${task}

Possible Causes:
- API issue
- Wrong endpoint
- Missing variable
- Invalid response handling

Suggested Fix:
Check logs and validate API response structure.
 `;
}
