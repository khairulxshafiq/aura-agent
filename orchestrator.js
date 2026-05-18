// ============================================================
// ROOT orchestrator.js — AURA v4.2.x (FIXED)
// - Auto-detect pipeline from URL
// - Tools route restored (webSearch, pipeline, image)
// - GDrive via tools/index.js exports (avoid mismatch)
// ============================================================

import dotenv from "dotenv";
dotenv.config();

import {
  webSearch,
  generateImage,
  writeContent,
  generateCaption,
  searchMemory,
  saveMemory,
  logActivity,
  airtableCreate,
  sendTelegramImage,
  sendTelegramBase64Image,
  buildContext,
  detectFeedback,
  savePreference,
  saveConversation,
  uploadImageToGDrive,
  downloadAndUploadToGDrive,
  testGDrive,
  uploadTestImage,
  chatCompletion,
  firecrawlSearch
} from "./tools/index.js";

// ---------------- Helpers ----------------
function hasUrl(t) {
  return /https?:\/\/\S+/i.test(t || "");
}
function getUrl(t) {
  var m = String(t || "").match(/https?:\/\/\S+/i);
  return m ? m[0] : null;
}
function wantsPipeline(t) {
  var s = String(t || "").toLowerCase();
  return (
    s.includes("/pipeline") ||
    s.includes("pipeline") ||
    s.includes("scrape") ||
    s.includes("scrap") ||
    s.includes("scraping") ||
    s.includes("content fb") ||
    s.includes("content facebook") ||
    s.includes("draft fb")
  );
}

function isImageIntent(message) {
  var msg = (message || "").toLowerCase();
  if (msg.startsWith("/image")) return true;
  var hasImageWord =
    msg.includes("gambar") ||
    msg.includes("imej") ||
    msg.includes("image") ||
    msg.includes("poster") ||
    msg.includes("logo") ||
    msg.includes("banner") ||
    msg.includes("visual");
  var hasAction =
    msg.includes("buat") ||
    msg.includes("create") ||
    msg.includes("generate") ||
    msg.includes("hasilkan") ||
    msg.includes("lukis") ||
    msg.includes("design");
  return hasImageWord && (hasAction || msg.includes("nak"));
}

async function processContentPipeline(url) {
  // Firecrawl prompt: extract image + summary
  var scrape = await firecrawlSearch(
    "Baca artikel ini: " + url +
    "\n\nBeri dua benda:\n1) URL gambar utama: IMAGE_URL: https://...\n2) Ringkasan artikel.\n\nFormat:\nIMAGE_URL: [url]\nCONTENT: [ringkasan]",
    { model: "google/gemini-2.5-flash", depth: "high", maxResults: 1, maxTokens: 4096 }
  );

  if (!scrape || !scrape.success) return { success: false, error: scrape ? scrape.error : "scrape failed" };

  var full = scrape.content || "";
  var imgMatch = full.match(/IMAGE_URL:\s*(https?:\/\/\S+)/i);
  var articleImage = imgMatch ? imgMatch[1] : null;

  var articleContent = full
    .replace(/IMAGE_URL:\s*https?:\/\/\S+/i, "")
    .replace(/^CONTENT:\s*/im, "")
    .trim();

  // Generate FB caption
  var cap = await generateCaption(articleContent, "facebook", "engaging");

  // Rehost image to GDrive + attach to Airtable
  var fields = {
    "Title": url.substring(0, 80),
    "Caption": cap || articleContent.substring(0, 1500),
    "Platform": "Facebook",
    "Status": "Draft",
    "Created By": "AURA Pipeline",
    "Brand": "Sakluma"
  };

  if (articleImage) {
    var gd = await downloadAndUploadToGDrive(articleImage, "article_" + Date.now() + ".png");
    if (gd && gd.success) {
      fields["Image URL"] = gd.url;
      fields["Image file"] = [{ url: gd.url }];
    } else {
      fields["Image URL"] = articleImage;
    }
  }

  try {
    await airtableCreate(fields);
  } catch (e) {
    // still return content even if airtable fails
  }

  return { success: true, articleImage, caption: fields["Caption"], imageUrl: fields["Image URL"] || "" };
}

// ---------------- Main ----------------
export async function runOrchestrator(task, context = {}) {
  var chatId = context.chatId || "default";
  var start = Date.now();

  try {
    await saveConversation(chatId, "user", task);

    var feedbacks = detectFeedback(task);
    for (var i = 0; i < feedbacks.length; i++) {
      await savePreference(chatId, feedbacks[i].key, feedbacks[i].value, task);
    }

    // ===== Commands =====
    var lower = String(task || "").trim().toLowerCase();

    if (lower.startsWith("/gdrive_test")) {
      var r1 = await testGDrive();
      var m1 = r1 && r1.success
        ? "✅ GDRIVE OK\nFile: " + r1.fileName + "\nURL: " + r1.url
        : "❌ GDRIVE FAIL\n" + (r1 ? r1.error : "unknown");
      await saveConversation(chatId, "assistant", m1);
      return { response: m1, result: m1 };
    }

    if (lower.startsWith("/gdrive_upload_test")) {
      var r2 = await uploadTestImage();
      var m2 = r2 && r2.success
        ? "✅ GDRIVE UPLOAD OK\nFile: " + r2.fileName + "\nURL: " + r2.url
        : "❌ GDRIVE UPLOAD FAIL\n" + (r2 ? r2.error : "unknown");
      await saveConversation(chatId, "assistant", m2);
      return { response: m2, result: m2 };
    }

    // ===== Auto Pipeline (URL + scrape request) =====
    if (hasUrl(task) && wantsPipeline(task)) {
      var url = getUrl(task);
      var pr = await processContentPipeline(url);
      var out = pr.success
        ? "✅ Pipeline siap.\n\nDraft dah masuk Airtable.\n" + (pr.imageUrl ? ("Gambar: " + pr.imageUrl) : "")
        : "❌ Pipeline gagal: " + pr.error;

      await saveMemory(task, out, chatId);
      await saveConversation(chatId, "assistant", out.substring(0, 2000));
      return { response: out, result: out };
    }

    // ===== Image intent =====
    if (isImageIntent(task)) {
      var prompt = String(task).replace(/^\/image\s*/i, "");
      var img = null;
      for (var attempt = 1; attempt <= 2; attempt++) {
        img = await generateImage(prompt, { width: 1024, height: 1024 });
        if (img) break;
      }

      if (!img) {
        var fail = "Gambar tak berjaya. Cuba bagi detail sikit (contoh: gaya, warna, suasana) dan saya buat semula.";
        await saveConversation(chatId, "assistant", fail);
        return { response: fail, result: fail };
      }

      // if base64 -> telegram
      if (String(img).startsWith("data:image")) {
        await sendTelegramBase64Image(img, "🎨 Gambar siap!", { chatId });
        var ok = "✅ Gambar siap.";
        await saveConversation(chatId, "assistant", ok);
        return { response: ok, result: ok };
      }

      // if url
      if (String(img).startsWith("http")) {
        await sendTelegramImage(img, "🎨 Gambar siap!", { chatId });
        var ok2 = "✅ Gambar siap.\n" + img;
        await saveConversation(chatId, "assistant", ok2.substring(0, 2000));
        return { response: ok2, result: ok2 };
      }
    }

    // ===== Normal chat w/ memory =====
    var memCtx = await buildContext(chatId);
    var history = memCtx.history || [];

    // If user asks "hari ini" / website question => use webSearch instead of generic LLM
    if (String(task).toLowerCase().includes("hari ini") && (String(task).toLowerCase().includes("website") || String(task).toLowerCase().includes("rotikaya"))) {
      var sres = await webSearch(task);
      var txt = (sres && sres.answer) ? sres.answer : "Tak jumpa hasil yang sesuai. Cuba bagi keyword lain?";
      await saveConversation(chatId, "assistant", txt.substring(0, 2000));
      await saveMemory(task, txt, chatId);
      return { response: txt, result: txt };
    }

    var resp = await chatCompletion({
      model: "google/gemini-2.5-flash",
      messages: [...history.slice(-5), { role: "user", content: task }],
      systemPrompt: "Balas BM santai. Jangan sebut AI, jangan cakap 'tak boleh'. Kalau perlu, guna tool yang ada.",
      maxTokens: 1200,
      temperature: 0.7,
    });

    var finalText = resp && resp.success ? resp.content : "Alamak, ada glitch. Cuba lagi kejap.";
    await saveMemory(task, finalText, chatId);
    await logActivity("orchestrator", task, finalText, "success");
    await saveConversation(chatId, "assistant", finalText.substring(0, 2000));

    return { response: finalText, result: finalText };
  } catch (e) {
    console.error("ORCHESTRATOR FAILED:", e.message);
    return { response: "Alamak ada glitch. Cuba lagi kejap.", error: true };
  } finally {
    console.log("AURA COMPLETE - " + (Date.now() - start) + "ms");
  }
}

export default { runOrchestrator };
