// ============================================================
// AURA v4.2 — Orchestrator (The Brain)
// - Image Tool Router (robust)
// - /gdrive_test + /gdrive_upload_test
// - Better image intent detection: "create gambar" etc.
// - Retry mechanism for image generation
// ============================================================

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { chooseModel, TASK_MODEL_MAP } from "./tools/modelRouter.js";
import { chatCompletion, firecrawlSearch, openRouterAnalyzeImage, getCostReport, shouldUseFreeModel } from "./tools/openRouter.js";

// Import normal tools from tools/index.js
import {
  webSearch, research, generateImage, analyzeImage, writeContent, generateCaption,
  searchMemory, saveMemory, logActivity,
  airtableCreate, airtableUpdate, airtableFindByFormula, airtableGet,
  sendTelegramImage, sendTelegramBase64Image,
  saveConversation, buildContext, detectFeedback, savePreference
} from "./tools/index.js";

// Import GDrive direct (avoid export mismatch in tools/index.js)
import { testGDrive, uploadTestImage, uploadImageToGDrive, downloadAndUploadToGDrive } from "./tools/gdrive.js";

// ============================================================
// Helpers
// ============================================================

function extractSmartTitle(caption, originalTask) {
  if (!caption) return (originalTask || "Untitled").substring(0, 80);
  const text = caption.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "").trim();
  const lines = text.split("\n");
  for (const line0 of lines) {
    const line = line0.replace(/\*\*/g, "").replace(/#\w+/g, "").trim();
    if (line.length > 10 && line.length < 100) return line.substring(0, 80);
  }
  return text.substring(0, 80).replace(/\n/g, " ");
}

function extractHashtags(caption) {
  if (!caption) return "";
  const matches = caption.match(/#[A-Za-z0-9_\u00C0-\u024F]+/g);
  if (!matches) return "";
  const seen = new Set();
  const unique = [];
  for (const tag of matches) {
    const k = tag.toLowerCase();
    if (!seen.has(k)) { seen.add(k); unique.push(tag); }
  }
  return unique.join(" ");
}

function extractImageUrl(text) {
  if (!text) return null;
  const prefixMatch = text.match(/IMAGE_URL:\s*(https?:\/\/[^\s"'<>]+)/i);
  if (prefixMatch) return prefixMatch[1];
  const urlMatch = text.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/i);
  return urlMatch ? urlMatch[1] : null;
}

function getMaxTokens(taskType) {
  const limits = { simple_chat: 500, content: 1500, coding: 3000, research: 2000, finance: 1500, image: 800, report: 500 };
  return limits[taskType] || 1500;
}

// =====================
// Persona sanitize (HOLD dulu fine — tapi aku letak minimal supaya tak spoil)
// =====================
function sanitizePersona(text) {
  if (!text) return text;
  const t = String(text);
  const lower = t.toLowerCase();

  const banned = [
    "sebagai model bahasa ai",
    "saya direka untuk",
    "saya dilatih",
    "sila ambil perhatian",
    "as an ai",
    "language model",
    "i am an ai",
  ];

  for (const b of banned) {
    if (lower.includes(b)) {
      // strip these lines only (not replace whole message)
      return t
        .split("\n")
        .filter(line => !line.toLowerCase().includes(b))
        .join("\n")
        .trim() || "Faham. Jom buat terus.";
    }
  }
  return t;
}

// Remove markdown bullet/bold that looks robotic in Telegram
function sanitizeFormatting(text) {
  if (!text) return text;
  return String(text)
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .trim();
}

// =====================
// Image Intent Router
// =====================
function isImageIntent(message) {
  const msg = (message || "").toLowerCase();

  // explicit commands
  if (msg.startsWith("/image")) return true;

  // words that indicate image request
  const hasImageWord =
    msg.includes("gambar") ||
    msg.includes("imej") ||
    msg.includes("image") ||
    msg.includes("poster") ||
    msg.includes("logo") ||
    msg.includes("banner") ||
    msg.includes("visual") ||
    msg.includes("thumbnail");

  const hasActionWord =
    msg.includes("buat") ||
    msg.includes("create") ||
    msg.includes("generate") ||
    msg.includes("hasilkan") ||
    msg.includes("lukis") ||
    msg.includes("design");

  // avoid false positive for "gambar dalam artikel" (pipeline)
  const looksLikeArticleImage = msg.includes("gambar artikel") || msg.includes("og:image");

  return (hasImageWord && (hasActionWord || msg.includes("nak"))) && !looksLikeArticleImage;
}

function wantsGDriveUpload(message) {
  const msg = (message || "").toLowerCase();
  return msg.includes("gdrive") || msg.includes("google drive") || msg.includes("upload") || msg.includes("muat naik");
}

function wantsAirtableSave(message) {
  const msg = (message || "").toLowerCase();
  return msg.includes("airtable") || msg.includes("save") || msg.includes("simpan") || msg.includes("draft");
}

function buildImagePrompt(userText) {
  // Keep user intent, but format to be image-gen friendly
  const base = (userText || "").trim();

  // If user uses "/image", strip it
  const cleaned = base.replace(/^\/image\s*/i, "").trim() || base;

  // Add style hints that generally improve output
  return (
    cleaned +
    "\n\nGaya: ilustrasi sinematik, tajam, warna cantik, komposisi kemas, pencahayaan menarik. " +
    "Elak teks dalam gambar. Resolusi tinggi."
  );
}

async function runImagePipeline(task, chatId) {
  const prompt = buildImagePrompt(task);
  const upload = wantsGDriveUpload(task) || wantsAirtableSave(task);

  // Retry mechanism
  let img = null;
  let lastErr = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[ImageRouter] Attempt ${attempt}: generating image...`);
      img = await generateImage(prompt, { width: 1024, height: 1024 });
      if (img && (img.startsWith("data:image") || img.startsWith("http"))) break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!img) {
    return {
      success: false,
      message: "Gambar belum lepas lagi. Cuba bagi detail sikit (contoh: gaya, warna, suasana) dan aku buat semula.",
      error: lastErr ? lastErr.message : "generateImage returned null",
    };
  }

  // If base64 and user wants GDrive, upload it
  if (img.startsWith("data:image") && upload) {
    const up = await uploadImageToGDrive(img, `aura_${Date.now()}.png`);
    if (up.success) {
      return {
        success: true,
        mode: "gdrive",
        url: up.url,
        thumbnailUrl: up.thumbnailUrl,
        webViewLink: up.webViewLink,
      };
    }
    // fallback: send base64 direct to Telegram
    console.log("[ImageRouter] GDrive upload failed, fallback to Telegram base64:", up.error);
  }

  // Send direct
  return {
    success: true,
    mode: "telegram",
    data: img,
  };
}

// ============================================================
// Content Pipeline (Article → Image → GDrive → Airtable) — keep
// ============================================================
async function processContentPipeline(url, options = {}) {
  const brand = options.brand || "Sakluma";
  const platforms = options.platforms || ["fb", "threads", "x"];

  console.log("[Pipeline] Scraping:", url);

  const scrape = await firecrawlSearch(
    "Baca artikel ini: " + url +
    "\n\nBeri DUA benda:\n1) URL gambar utama artikel (og:image atau gambar pertama): IMAGE_URL: https://...\n2) Ringkasan lengkap artikel.\n\nFormat:\nIMAGE_URL: [url]\nCONTENT: [ringkasan]",
    { model: "google/gemini-2.5-flash", depth: "high", maxResults: 1, maxTokens: 4096 }
  );

  if (!scrape.success) return { success: false, error: scrape.error };

  const fullResponse = scrape.content || "";
  const articleImage = extractImageUrl(fullResponse);
  const articleContent = fullResponse
    .replace(/IMAGE_URL:\s*https?:\/\/[^\s\n]+/i, "")
    .replace(/^CONTENT:\s*/im, "")
    .trim();

  const results = {};

  const fmts = {
    fb: "Facebook post, storytelling, 3-5 perenggan pendek. BM sahaja.",
    threads: "Threads bebenang style, BM sahaja.",
    x: "X/Twitter, max 280 aksara, BM sahaja.",
    ig: "Instagram caption, 8-12 hashtags, BM sahaja.",
  };

  for (const p of platforms) {
    const cr = await chatCompletion({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: "Buat " + (fmts[p] || fmts.fb) + "\nBrand: " + brand + "\nArtikel:\n" + articleContent }],
      systemPrompt: "Tulis BM santai, jangan terlalu formal. Jangan sebut AI.",
      maxTokens: 1500,
      temperature: 0.85,
    });

    results[p] = { success: cr.success, content: sanitizeFormatting(sanitizePersona(cr.content || "")), model: cr.model };
  }

  // Save to Airtable, re-host image to GDrive
  const bestCaption = results.fb && results.fb.success ? results.fb.content : "";
  const airtableFields = {
    "Title": extractSmartTitle(bestCaption, url),
    "Caption": bestCaption,
    "Platform": "Facebook",
    "Status": "Draft",
    "Created By": "AURA Pipeline",
    "Content Type": articleImage ? "Image" : "Post",
    "AI Caption": bestCaption,
    "AI Hashtags": extractHashtags(bestCaption),
    "Hashtags": extractHashtags(bestCaption),
    "Brand": brand,
    "AI Content Insights": "Sumber: " + url + " | Pipeline",
  };

  if (articleImage) {
    const gd = await downloadAndUploadToGDrive(articleImage, `article_${Date.now()}.png`);
    if (gd.success) {
      airtableFields["Image URL"] = gd.url;
      airtableFields["Image file"] = [{ url: gd.url }];
    } else {
      airtableFields["Image URL"] = articleImage;
    }
  }

  try { await airtableCreate(airtableFields); } catch (e) { console.error("[Pipeline] Airtable save failed:", e.message); }

  return { success: true, articleImage, platforms: results };
}

// ============================================================
// Main Orchestrator
// ============================================================
export async function runOrchestrator(task, context = {}) {
  const start = Date.now();
  const chatId = context.chatId || "default";

  console.log("\n=================================");
  console.log("AURA v4.2.0 | " + String(task || "").substring(0, 80));
  console.log("=================================");

  try {
    // Save convo (user)
    await saveConversation(chatId, "user", task);

    // Preference learning
    const feedbacks = detectFeedback(task);
    for (const f of feedbacks) {
      await savePreference(chatId, f.key, f.value, task);
    }

    // ---- COMMANDS (NO LLM FALLBACK) ----
    const lower = (task || "").trim().toLowerCase();

    if (lower.startsWith("/memtest")) {
      const q = lower.replace("/memtest", "").trim() || ("test-" + Date.now());
      await saveMemory("memtest:" + q, "MEMTEST_OK:" + new Date().toISOString(), chatId);
      const found = await searchMemory(q, chatId);

      const top = (found && found[0])
        ? ("Top: " + (found[0].task || "") + " | " + String(found[0].result || "").substring(0, 80))
        : "Top: (tiada)";

      const msg = "🧠 MEMTEST OK\n" + "Query: " + q + "\n" + "Found: " + (found ? found.length : 0) + "\n" + top;
      await saveConversation(chatId, "assistant", msg);
      return { response: msg, result: msg };
    }

    if (lower.startsWith("/gdrive_test")) {
      const r = await testGDrive();
      const msg = r.success
        ? `✅ GDRIVE OK\nFile: ${r.fileName}\nURL: ${r.url}`
        : `❌ GDRIVE FAIL\n${r.error}`;
      await saveConversation(chatId, "assistant", msg);
      return { response: msg, result: msg };
    }

    if (lower.startsWith("/gdrive_upload_test")) {
      const r = await uploadTestImage();
      const msg = r.success
        ? `✅ GDRIVE UPLOAD OK\nFile: ${r.fileName}\nURL: ${r.url}`
        : `❌ GDRIVE UPLOAD FAIL\n${r.error}`;
      await saveConversation(chatId, "assistant", msg);
      return { response: msg, result: msg };
    }

    // ---- PIPELINE command ----
    if (lower.startsWith("/pipeline")) {
      const urlMatch = String(task).match(/https?:\/\/[^\s]+/);
      if (!urlMatch) return { response: "Bagi URL sekali. Contoh: /pipeline https://...", error: true };
      const pr = await processContentPipeline(urlMatch[0]);
      if (!pr.success) return { response: "Pipeline gagal: " + pr.error, error: true };

      let pt = "📰 Pipeline siap.\n\n";
      if (pr.articleImage) pt += "✅ Gambar: masuk Airtable (attachment)\n\n";
      if (pr.platforms.fb?.success) pt += "FB:\n" + pr.platforms.fb.content + "\n\n";
      if (pr.platforms.threads?.success) pt += "Threads:\n" + pr.platforms.threads.content + "\n\n";
      if (pr.platforms.x?.success) pt += "X:\n" + pr.platforms.x.content + "\n\n";
      pt += "✅ Draft dah masuk Airtable.";

      pt = sanitizeFormatting(sanitizePersona(pt));
      await saveConversation(chatId, "assistant", pt.substring(0, 2000));
      return { response: pt, result: pt };
    }

    // ---- IMAGE ROUTER (runs BEFORE normal planning) ----
    if (isImageIntent(task)) {
      const imgRes = await runImagePipeline(task, chatId);

      if (!imgRes.success) {
        const msg = sanitizeFormatting(sanitizePersona(imgRes.message));
        await saveMemory(task, msg, chatId);
        await saveConversation(chatId, "assistant", msg);
        return { response: msg, result: msg };
      }

      // If uploaded to GDrive => return url + also send Telegram as URL (works with sendTelegramImage)
      if (imgRes.mode === "gdrive") {
        const msg = "✅ Gambar siap & dah upload ke Google Drive.\n" + imgRes.url;
        await sendTelegramImage(imgRes.url, "🎨 Gambar siap!", { chatId });
        await saveMemory(task, msg, chatId);
        await saveConversation(chatId, "assistant", msg.substring(0, 2000));
        return { response: msg, result: msg };
      }

      // Telegram mode: base64 or url
      if (imgRes.data.startsWith("data:image")) {
        await sendTelegramBase64Image(imgRes.data, "🎨 Gambar siap!", { chatId });
        const msg = "✅ Gambar siap.";
        await saveMemory(task, msg, chatId);
        await saveConversation(chatId, "assistant", msg);
        return { response: msg, result: msg };
      }

      if (imgRes.data.startsWith("http")) {
        await sendTelegramImage(imgRes.data, "🎨 Gambar siap!", { chatId });
        const msg = "✅ Gambar siap.\n" + imgRes.data;
        await saveMemory(task, msg, chatId);
        await saveConversation(chatId, "assistant", msg.substring(0, 2000));
        return { response: msg, result: msg };
      }
    }

    // ---- Normal flow (text) ----
    const memContext = await buildContext(chatId);
    const history = memContext.history || [];
    const prefString = memContext.prefString || "";

    // Understanding
    console.log("STEP 1: UNDERSTANDING");
    const understandingPrompt =
      "Balas dalam BM santai. Jangan sebut AI. Jangan disclaimer. Jangan format bullet.\n" +
      prefString;

    const understanding = await chatCompletion({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: "Ringkaskan apa user nak (1 ayat): " + task }],
      systemPrompt: understandingPrompt,
      temperature: 0.2,
      maxTokens: 120,
    });

    // Memory recall
    console.log("STEP 2: MEMORY");
    const memories = await searchMemory(task, chatId);

    // Planner (simple)
    console.log("STEP 3: PLANNING");
    const plan = [{ step: 1, agent: "content", action: "respond", params: {}, depends_on: null }];

    console.log("STEP 4: EXECUTION");
    let finalResponse = "";

    // Execute single response using writeContent/call LLM
    const rolePrompt =
      "Kau AURA. Kawan yang santai. BM sahaja.\n" +
      "Jangan bullet, jangan bold, jangan disclaimer, jangan ayat formal.\n" +
      "Jawab ringkas tapi padu.\n";

    const resp = await chatCompletion({
      model: shouldUseFreeModel() ? "google/gemini-2.5-flash" : "openai/gpt-4o-mini",
      messages: [...history.slice(-5), { role: "user", content: task }],
      systemPrompt: rolePrompt,
      temperature: 0.7,
      maxTokens: getMaxTokens("content"),
    });

    finalResponse = resp.success ? resp.content : "Aku tak dapat jawab kejap ni. Cuba ulang sekali.";
    finalResponse = sanitizeFormatting(sanitizePersona(finalResponse));

    console.log("STEP 5: REVIEW");
    console.log("STEP 6: MEMORY");

    await saveMemory(task, finalResponse, chatId);
    await logActivity("orchestrator", task, finalResponse, "success");
    await saveConversation(chatId, "assistant", finalResponse.substring(0, 2000));

    console.log("AURA COMPLETE - " + (Date.now() - start) + "ms");
    return { response: finalResponse, result: finalResponse };

  } catch (error) {
    console.error("ORCHESTRATOR FAILED:", error.message || error);
    return { response: "Alamak ada glitch. Cuba lagi kejap.", error: true };
  }
}

export async function processMessage(userMessage, context) {
  return await runOrchestrator(userMessage, context);
}

export default { runOrchestrator, processMessage };
