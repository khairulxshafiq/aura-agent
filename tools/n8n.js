import axios from "axios";

const N8N_URL = process.env.N8N_WEBHOOK_URL;

export async function triggerN8n(data, options = {}) {
  try {
    const { webhookPath = "" } = options;
    const url = webhookPath ? `${N8N_URL}/${webhookPath}` : N8N_URL;
    console.log("Triggering n8n:", url);
    const response = await axios.post(url, data, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000
    });
    console.log("n8n triggered");
    return { triggered: true, data: response.data };
  } catch (err) {
    console.error("n8n error:", err.message);
    return { triggered: false, error: err.message };
  }
}
