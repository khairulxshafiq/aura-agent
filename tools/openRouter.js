import axios from "axios";

var OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// === Image Generation via OpenRouter ===
// Endpoint: /api/v1/chat/completions (same as text)
// Required: modalities: ["image", "text"]
// Response: choices[0].message.images[0].image_url.url
// IMPORTANT: gemini-2.0-flash-001 CANNOT generate images
// Must use image-capable models like gemini-3.1-flash-image-preview
export async function generateImage(prompt, options) {
  if (!options) { options = {}; }

  // Models that CAN generate images (from OpenRouter docs)
  var models = [
    "google/gemini-3.1-flash-image-preview",
    "google/gemini-2.5-flash-image"
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
              content: "Generate this image. Only output the image, no text explanation needed: " + prompt
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

      // Official format: choices[0].message.images[]
      if (data && data.choices && data.choices[0] && data.choices[0].message) {
        var msg = data.choices[0].message;

        // Method 1: images array (official OpenRouter response)
        if (msg.images && msg.images.length > 0) {
          var imgObj = msg.images[0];
          if (imgObj.image_url && imgObj.image_url.url) {
            console.log("[Tool] generateImage: SUCCESS via images array");
            return imgObj.image_url.url;
          }
        }

        // Method 2: imageUrl (some SDK format)
        if (msg.images && msg.images.length > 0) {
          var imgObj2 = msg.images[0];
          if (imgObj2.imageUrl && imgObj2.imageUrl.url) {
            console.log("[Tool] generateImage: SUCCESS via imageUrl");
            return imgObj2.imageUrl.url;
          }
        }

        // Method 3: content contains base64
        if (msg.content && msg.content.indexOf("data:image") > -1) {
          var b64match = msg.content.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+\/=]+/);
          if (b64match) {
            console.log("[Tool] generateImage: SUCCESS via content base64");
            return b64match[0];
          }
        }

        // Method 4: markdown image
        if (msg.content && msg.content.indexOf("![") > -1) {
          var mdMatch = msg.content.match(/!\[.*?\]\((data:image[^)]+)\)/);
          if (mdMatch && mdMatch[1]) {
            console.log("[Tool] generateImage: SUCCESS via markdown");
            return mdMatch[1];
          }
        }
      }

      // Debug: log what we actually got
      console.error("[Tool] generateImage: no image found for " + model);
      if (data && data.choices && data.choices[0] && data.choices[0].message) {
        var preview = JSON.stringify(data.choices[0].message).substring(0, 300);
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
