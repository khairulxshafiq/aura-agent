import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function generateImage(prompt, options = {}) {
  try {
    const { model = "black-forest-labs/flux-schnell", width = 1024, height = 1024 } = options;
    console.log("Generating image...");
    const output = await replicate.run(model, {
      input: { prompt, width, height, num_outputs: 1 }
    });
    const imageUrl = Array.isArray(output) ? output[0] : output;
    console.log("Image generated");
    return imageUrl;
  } catch (err) {
    console.error("Replicate error:", err.message);
    return null;
  }
}
