import axios from "axios";

var OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// === Image Generation via OpenRouter ===
export async function generateImage(prompt, options) {
  if (!options) { options = {}; }
  var models = [
    "black-forest-labs/flux-schnell",
    "black-forest-labs/flux-1.1-pro"
  ];

  for (var m = 0; m < models.length; m++) {
    try {
      var model = models[m];
      console.log("[Tool] generateImage model: " + model);
      console.log("[Tool] Prompt: " + prompt.substring(0, 100));

      var resp = await axios.post(
        "https://openrouter.ai/api/v1/images/generations",
        {
          model: model,
          prompt: prompt,
          n: 1,
          size: "1024x1024"
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + OPENROUTER_API_KEY
          },
          timeout: 60000
        }
      );

      var data = resp.data;

      if (data && data.data && data.data[0]) {
        if (data.data[0].url) {
          console.log("[Tool] generateImage: SUCCESS (URL)");
          return data.data[0].url;
        }
        if (data.data[0].b64_json) {
          console.log("[Tool] generateImage: SUCCESS (base64)");
          return "data:image/png;base64," + data.data[0].b64_json;
        }
      }

      console.error("[Tool] generateImage: no image in response");

    } catch (err) {
      console.error("[Tool] generateImage error (" + models[m] + "): " + err.message);
      if (err.response) {
        console.error("[Tool] Status: " + err.response.status);
        console.error("[Tool] Data: " + JSON.stringify(err.response.data).substring(0, 300));
      }
    }
  }

  console.error("[Tool] generateImage: ALL MODELS FAILED");
  return null;
}
