const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const env = require("../config/env");
const { sendTelegramMessage } = require("../utils/telegram");
const WhatsAppJob = require("../models/WhatsAppJob");

async function runTest() {
  console.log("=== TESTING TELEGRAM & WHATSAPP CHANNELS ===\n");

  const groups = ["B1/B2", "F1/F2", "H1B/H4"];
  const testTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";

  // 1. Test Telegram
  for (const g of groups) {
    const text =
      `🧪 SYSTEM TEST ALERT — ${g}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ Channel Connection Verified\n` +
      `🕒 Sent At: ${testTime}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌐 Track Live: usvisaslotsupdate.com\n` +
      `📞 Contact: 8143852523`;
    try {
      console.log(`[Telegram] Sending test alert for ${g}...`);
      await sendTelegramMessage(text, g);
      console.log(`[Telegram] ✔ Successfully delivered to ${g}!`);
    } catch (err) {
      console.error(`[Telegram] ❌ Error delivering to ${g}:`, err.message);
    }
  }

  // 2. Queue WhatsApp test alerts
  console.log("\n[WhatsApp] Connecting to MongoDB to queue WhatsApp test jobs...");
  await mongoose.connect(env.mongoUri);
  console.log("[WhatsApp] Connected to MongoDB.");

  for (const g of groups) {
    const dedupeKey = `test-${g.replace(/\//g, "-")}-${Date.now()}`;
    await WhatsAppJob.create({
      dedupeKey,
      category: g,
      group: g,
      location: "TEST NOTIFICATION",
      earliestDate: "TEST DATE",
      slots: "TEST",
      scheduledAt: new Date(),
      status: "pending",
      customText:
        `🧪 *VISA SLOTS UPDATES — TEST NOTIFICATION*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ *WhatsApp Alert Channel Connection Verified*\n\n` +
        `📋 *Category:* ${g}\n` +
        `🕒 *Sent At:* ${testTime}\n` +
        `⚠️ _This is an automated system test._\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 *Track Live:* usvisaslotsupdate.com\n` +
        `📞 *For Slot Bookings Contact:* 8143852523`,
    });
    console.log(`[WhatsApp] ✔ Queued test job for ${g} (AWS worker will dispatch)`);
  }

  await mongoose.disconnect();
  console.log("\n=== Test dispatches queued! ===");
}

runTest().catch(console.error);

