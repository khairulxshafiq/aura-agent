import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function generateImage(prompt, options = {}) {
  try {
    const {
      model = "black-forest-labs/flux-schnell",
      width = 1024,
      height = 1024,
    } = options;
    console.log("[Tool] generateImage:", prompt.substring(0, 80));
    const output = await replicate.run(model, {
      input: { prompt, width, height, num_outputs: 1 },
    });
    const imageUrl = Array.isArray(output) ? output[0] : output;
    console.log("[Tool] generateImage: done");
    return imageUrl;
  } catch (err) {
    console.error("[Tool] generateImage error:", err.message);
    return null;
  }
}
