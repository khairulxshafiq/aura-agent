import axios from "axios";

var OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// === Image Generation via OpenRouter Chat Completions ===
// OpenRouter uses /chat/completions with modalities param
// NOT /images/generations (that endpoint does not exist)
export async function generateImage(prompt, options) {
  if (!options) { options = {}; }

  var models = [
    "google/gemini-2.0-flash-001",
    "google/gemini-2.5-flash-image-preview"
  ];

  for (var m = 0; m < models.length; m++) {
    try {
      var model = models[m];
      console.log("[Tool] generateImage model: " + model);
      console.log("[Tool] Prompt: " + prompt.substring(0, 100));

      var resp = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: model,
          messages: [
            {
              role: "user",
              content: "Generate this image. No text reply needed, just the image: " + prompt
            }
          ],
          modalities: ["image", "text"]
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

      // Check choices[0].message.images array
      if (data && data.choices && data.choices[0] && data.choices[0].message) {
        var msg = data.choices[0].message;

        // Method 1: images array (official OpenRouter format)
        if (msg.images && msg.images.length > 0) {
          var imgObj = msg.images[0];
          if (imgObj.image_url && imgObj.image_url.url) {
            console.log("[Tool] generateImage: SUCCESS (images array)");
            return imgObj.image_url.url;
          }
        }

        // Method 2: content contains base64 data URI
        if (msg.content && msg.content.indexOf("data:image") > -1) {
          var match = msg.content.match(/data:image[^"\\s]+/);
          if (match) {
            console.log("[Tool] generateImage: SUCCESS (content base64)");
            return match[0];
          }
        }

        // Method 3: content has markdown image
        if (msg.content && msg.content.indexOf("![") > -1) {
          var mdMatch = msg.content.match(/!\[.*?\]\((data:image[^)]+)\)/);
          if (mdMatch && mdMatch[1]) {
            console.log("[Tool] generateImage: SUCCESS (markdown image)");
            return mdMatch[1];
          }
        }
      }

      console.error("[Tool] generateImage: no image found in response for " + model);
      if (data && data.choices && data.choices[0]) {
        var preview = JSON.stringify(data.choices[0].message).substring(0, 200);
        console.error("[Tool] Response preview: " + preview);
      }

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
