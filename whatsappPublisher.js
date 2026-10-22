/**
 * USA VISA SLOTS UPDATES - WHATSAPP PUBLISHER SERVICE
 * 
 * 24/7 Background Worker that:
 * 1. Connects to WhatsApp using an authenticated LocalAuth session.
 * 2. Periodically polls the server queue (GET /api/whatsapp-queue/next).
 * 3. Delivers confirmed visa slot alerts to designated WhatsApp Community / Announcement groups.
 * 4. Acknowledges delivery (POST /api/whatsapp-queue/:id/ack) or reports failures for retries.
 * 
 * Usage:
 *   node whatsappPublisher.js                  # Start 24/7 continuous queue poller
 *   node whatsappPublisher.js --test           # Send test alert to all 3 groups, then exit
 *   node whatsappPublisher.js --test F1/F2     # Send test alert to specific group (F1/F2, B1/B2, H1B/H4)
 *   node whatsappPublisher.js --scan           # Scan all joined chats and dump to JSON
 */

const path = require("path");
const fs = require("fs");
const axios = require("axios");
const qrcode = require("qrcode-terminal");

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

// Load backend .env
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");
const PUBLISHER_TOKEN = process.env.WHATSAPP_PUBLISHER_TOKEN || "";
const POLL_INTERVAL_MS = parseInt(process.env.WHATSAPP_POLL_INTERVAL_MS || "5000", 10);
const HEADLESS = process.env.WHATSAPP_HEADLESS === "true";

// Destination Announcement Group IDs
const DESTINATIONS = {
  "B1/B2": {
    name: "B1 B2 UPDATES",
    id: process.env.WHATSAPP_GROUP_B1B2 || "120363409650684618@g.us",
  },
  "F1/F2": {
    name: "F1/F2 updates",
    id: process.env.WHATSAPP_GROUP_F1F2 || "120363433828045224@g.us",
  },
  "H1B/H4": {
    name: "H1 H4 Live Updates",
    id: process.env.WHATSAPP_GROUP_H1BH4 || "120363410431386086@g.us",
  },
};

// Locate Chrome on Windows or system environments
const CHROME_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env.CHROME_BIN
].filter(Boolean);

const chromePath = CHROME_PATHS.find((p) => fs.existsSync(p));

// Parse CLI flags
const args = process.argv.slice(2);
const isScanMode = args.includes("--scan");
const isTestMode = args.includes("--test") || args.includes("--test-all");
const isTestAdmin = args.includes("--test-admin");
const testGroupArg = args.find((a, i) => args[i - 1] === "--test" && !a.startsWith("--")) || (isTestMode ? "all" : null);

console.log("\n=======================================================");
console.log(" 🇺🇸 USA VISA SLOTS UPDATES - WHATSAPP PUBLISHER");
console.log("=======================================================");
console.log(`Backend URL:        ${BACKEND_URL}`);
console.log(`Publisher Token:    ${PUBLISHER_TOKEN ? "Configured (●●●●" + PUBLISHER_TOKEN.slice(-4) + ")" : "MISSING!"}`);
console.log(`Polling Interval:   Every ${POLL_INTERVAL_MS / 1000}s`);
console.log(`Headless Mode:      ${HEADLESS}`);
console.log(`Chrome Executable:  ${chromePath || "Default Puppeteer Chromium"}`);
console.log(`Mode:               ${isScanMode ? "Chat Scanner" : isTestMode ? `Test Dispatch (${testGroupArg})` : "24/7 Queue Worker"}`);
console.log("=======================================================\n");

if (!PUBLISHER_TOKEN && !isScanMode) {
  console.warn("⚠️  WARNING: WHATSAPP_PUBLISHER_TOKEN is not set in .env!");
  console.warn("   Queue requests will be rejected by the backend with 401 Unauthorized.\n");
}

// ---------------------------------------------------------------------------
// WHATSAPP CLIENT INITIALIZATION
// ---------------------------------------------------------------------------
const sessionPath = path.join(__dirname, ".whatsapp-session");

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "airbow-visa-publisher",
    dataPath: sessionPath,
  }),
  puppeteer: {
    headless: HEADLESS,
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

let isReady = false;
let isPolling = false;
let pollerTimer = null;
let lastUnreachableLog = 0;

// ---------------------------------------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------------------------------------
client.on("qr", (qr) => {
  console.log("\n📲 [WhatsApp] Please scan this QR code with your WhatsApp account to log in:\n");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("🔐 [WhatsApp] Session authenticated successfully.");
});

client.on("authenticated", () => {
  console.log("WhatsApp authenticated.");
});

client.on("auth_failure", (message) => {
  console.error("❌ [WhatsApp] Authentication failed:", message);
  console.error("   Try deleting backend/.whatsapp-session to re-scan QR code.");
});

client.on("disconnected", async (reason) => {
  console.warn(`⚠️ [WhatsApp] Client disconnected: ${reason}`);
  isReady = false;
  if (pollerTimer) clearTimeout(pollerTimer);

  if (reason === "LOGOUT") {
    console.log("📲 [WhatsApp] Session was logged out on phone. Cleaning stale session data...");
    try {
      await client.destroy();
      const sDir = path.join(sessionPath, "session-airbow-visa-publisher");
      if (fs.existsSync(sDir)) fs.rmSync(sDir, { recursive: true, force: true });
    } catch {}
    console.log("📲 Stale session cleared. Re-run 'npm run whatsapp' to scan a fresh QR code.");
    process.exit(0);
  }

  console.log("🔄 [WhatsApp] Attempting reconnection in 15 seconds...");
  setTimeout(() => {
    client.initialize().catch((err) => console.error("Re-initialization failed:", err.message));
  }, 15000);
});

client.on("ready", async () => {
  isReady = true;
  console.log("🟢 [WhatsApp] Connected & Ready!\n");

  // Validate configured destination groups
  await verifyDestinations();

  if (isScanMode) {
    await runChatScan();
    await shutdown("Scan Complete");
    return;
  }

  if (isTestMode) {
    await runTestDispatches(testGroupArg);
    await shutdown("Test Complete");
    return;
  }

  // Start 24/7 Queue Poller
  console.log("🚀 [Queue Worker] Starting 24/7 queue poller...");
  scheduleNextPoll(1000);
});

// ---------------------------------------------------------------------------
// DESTINATION VERIFICATION
// ---------------------------------------------------------------------------
async function verifyDestinations() {
  console.log("📋 Verifying Destination Announcement Groups:");
  try {
    const chats = await client.getChats();
    const chatMap = new Map();
    for (const c of chats) {
      chatMap.set(c.id._serialized, c);
    }

    for (const [group, info] of Object.entries(DESTINATIONS)) {
      const match = chatMap.get(info.id);
      if (match) {
        console.log(`   ✔ ${group.padEnd(8)}: "${match.name}" (${info.id})`);
        try {
          if (typeof match.getInviteCode === "function") {
            const code = await match.getInviteCode();
            if (code) console.log(`     🎯 INVITE_LINK_${group}: https://chat.whatsapp.com/${code}`);
          }
        } catch (codeErr) {}
        try {
          const msgs = await match.fetchMessages({ limit: 500 });
          for (const m of msgs) {
            const linkMatch = (m.body || "").match(/https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+/);
            if (linkMatch) {
              console.log(`     🔗 Found invite link for ${group}: ${linkMatch[0]}`);
              break;
            }
          }
        } catch (invErr) {}
      } else {
        console.warn(`   ⚠️ ${group.padEnd(8)}: ID ${info.id} not found in joined chats list. Will verify on send.`);
      }
    }
    console.log("");
  } catch (err) {
    console.log("   Scanning finished.");
    console.warn("   [Destinations] Chat list check skipped:", err.message);
  }
}

// ---------------------------------------------------------------------------
// TEST DISPATCHES
// ---------------------------------------------------------------------------
async function runTestDispatches(targetGroup) {
  console.log(`🧪 Running live test notification for: ${targetGroup}\n`);
  const groupsToTest =
    targetGroup === "all" || !targetGroup
      ? Object.keys(DESTINATIONS)
      : [targetGroup.toUpperCase().replace(/\s+/g, "")];

  for (const groupKey of groupsToTest) {
    const dest = DESTINATIONS[groupKey] || Object.values(DESTINATIONS).find((d) => d.name.toLowerCase().includes(groupKey.toLowerCase()));
    if (!dest) {
      console.error(`❌ Unsupported test group: "${groupKey}". Valid options: F1/F2, B1/B2, H1B/H4`);
      continue;
    }

    const testTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";
    const testText = [
      "🧪 *VISA SLOTS UPDATES — TEST NOTIFICATION*",
      "━━━━━━━━━━━━━━━━━━━━",
      "✅ *WhatsApp Alert Channel Connection Verified*",
      "",
      `📋 *Visa Category:*        ${groupKey}`,
      `📍 *Destination:*          ${dest.name}`,
      `🕒 *Sent At:*              ${testTime}`,
      "",
      "⚠️ _This is an automated system test. No actual visa slot openings are being reported._",
      "━━━━━━━━━━━━━━━━━━━━",
      "🌐 *Track Live:* usvisaslotsupdate.com",
      "📞 *For Slot Bookings Contact:* 8143852523",
      "_Visa Slots Updates_",
    ].join("\n");

    try {
      console.log(`📤 Sending test alert to ${groupKey} ("${dest.name}" - ${dest.id})...`);
      const sentMsg = await client.sendMessage(dest.id, testText);
      console.log(`   ✔ Test delivered successfully! Message ID: ${sentMsg?.id?._serialized || "sent"}\n`);
    } catch (err) {
      console.error(`   ❌ Failed to send test alert to ${groupKey}: ${err.message}\n`);
    }

    // Gentle pause between messages
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ---------------------------------------------------------------------------
// CHAT SCANNER (Preserves original scan functionality)
// ---------------------------------------------------------------------------
async function runChatScan() {
  console.log("🔍 Scanning joined chats for visa groups...\n");
  try {
    const chats = await client.getChats();
    const results = chats
      .filter((chat) => chat.isGroup)
      .map((chat) => ({
        name: chat.name,
        id: chat.id._serialized,
        isAnnouncement: chat.isReadOnly || false,
        lastMessage: chat.lastMessage?.body ? chat.lastMessage.body.slice(0, 100) : "(unavailable)",
        timestamp: chat.lastMessage?.timestamp || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const outputPath = path.join(__dirname, "whatsapp-destination-scan.json");
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");

    console.log(`✔ Found ${results.length} group chats. Saved to: ${outputPath}`);
    console.log("\nVisa Related Groups Found:");
    results
      .filter((r) => /visa|slot|f1|f2|b1|b2|h1|h4|live|update/i.test(r.name))
      .forEach((r) => {
        console.log(`   • ${r.name.padEnd(45)} ID: ${r.id}`);
      });
  } catch (err) {
    console.error("Chat scan failed:", err.message);
  }
}

// ---------------------------------------------------------------------------
// 24/7 QUEUE POLLER
// ---------------------------------------------------------------------------
function scheduleNextPoll(delayMs = POLL_INTERVAL_MS) {
  if (pollerTimer) clearTimeout(pollerTimer);
  pollerTimer = setTimeout(pollQueue, delayMs);
}

async function pollQueue() {
  if (!isReady || isPolling) return;
  isPolling = true;

  try {
    const url = `${BACKEND_URL}/api/whatsapp-queue/next`;
    const resp = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${PUBLISHER_TOKEN}`,
      },
      timeout: 10000,
      validateStatus: (s) => s === 200 || s === 204 || s === 401 || s === 503,
    });

    if (resp.status === 204) {
      // No jobs currently due; wait normal interval
      isPolling = false;
      scheduleNextPoll(POLL_INTERVAL_MS);
      return;
    }

    if (resp.status === 401) {
      console.error("❌ [Queue Poller] Backend returned 401 Unauthorized. Verify WHATSAPP_PUBLISHER_TOKEN in .env!");
      isPolling = false;
      scheduleNextPoll(30000); // Back off
      return;
    }

    if (resp.status === 503) {
      console.warn("⚠️ [Queue Poller] WhatsApp publisher not enabled on backend.");
      isPolling = false;
      scheduleNextPoll(30000);
      return;
    }

    if (resp.status === 200 && resp.data && resp.data.job) {
      const { job } = resp.data;
      console.log(`\n📬 [Queue Poller] Claimed job #${job.id}: ${job.group} @ ${job.location || "Center"} (Attempt ${job.attempts})`);

      await processJob(job);

      // Brief delay after sending before checking next job
      isPolling = false;
      scheduleNextPoll(2000);
      return;
    }
  } catch (err) {
    const now = Date.now();
    // Throttle unreachable logs to once every 60 seconds
    if (now - lastUnreachableLog > 60000) {
      console.warn(`⚠️ [Queue Poller] Cannot reach backend at ${BACKEND_URL} (${err.message}). Retrying...`);
      lastUnreachableLog = now;
    }
  }

  isPolling = false;
  scheduleNextPoll(POLL_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// JOB PROCESSOR & ACK / FAIL REPORTING
// ---------------------------------------------------------------------------
async function processJob(job) {
  let targetId = job.recipient ? job.recipient.trim() : "";
  let targetLabel = "";

  if (targetId) {
    if (!targetId.includes("@")) {
      const cleanDigits = targetId.replace(/\D/g, "");
      targetId = (cleanDigits.length === 10 ? "91" + cleanDigits : cleanDigits) + "@c.us";
    }
    targetLabel = "Direct Recipient (" + targetId + ")";
  } else {
    const destInfo = DESTINATIONS[job.group];
    if (!destInfo || !destInfo.id) {
      const errText = "No destination group ID configured for group \"" + job.group + "\"";
      console.error("❌ [Job #" + job.id + "] " + errText);
      await reportFail(job.id, errText);
      return;
    }
    targetId = destInfo.id;
    targetLabel = job.group + " (\"" + destInfo.name + "\" - " + destInfo.id + ")";
  }

  try {
    console.log("📤 [Job #" + job.id + "] Sending WhatsApp alert to " + targetLabel + "...");
    let sent = false;
    if (job.screenshot && typeof job.screenshot === "string" && job.screenshot.startsWith("data:")) {
      try {
        const commaIdx = job.screenshot.indexOf(",");
        if (commaIdx !== -1) {
          const header = job.screenshot.slice(0, commaIdx);
          const mime = header.split(";")[0].replace(/^data:/, "") || "image/png";
          const b64 = job.screenshot.slice(commaIdx + 1);
          const media = new MessageMedia(mime, b64, "visa-slot-update.png");
          await client.sendMessage(targetId, media, { caption: job.text });
          sent = true;
          console.log("📸 [Job #" + job.id + "] Screenshot photo delivered with caption!");
        }
      } catch (mediaErr) {
        console.warn("⚠️ [Job #" + job.id + "] Photo dispatch failed (" + mediaErr.message + "), falling back to text...");
      }
    }

    if (!sent) {
      await client.sendMessage(targetId, job.text);
    }

    console.log("✔  [Job #" + job.id + "] Message delivered successfully to " + targetLabel + "!");
    await reportAck(job.id);
  } catch (sendErr) {
    console.error("❌ [Job #" + job.id + "] Send failed: " + sendErr.message);
    await reportFail(job.id, sendErr.message);
  }
}

async function runTestAdminDispatch() {
  const adminJid = (process.env.ADMIN_WHATSAPP || "918143852523").replace(/\D/g, "") + "@c.us";
  const testTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";
  const testMsg = [
    "🚨 *VISA SLOTS UPDATES — ADMIN ALERT TEST*",
    "━━━━━━━━━━━━━━━━━━━━",
    "✅ Direct WhatsApp alert pipe to admin is ACTIVE",
    "",
    "👤 *Client Name:*      Test Lead Applicant",
    "📞 *Mobile:*           +91 81438 52523",
    "📋 *Visa Category:*    B1/B2 Visitor",
    "⏰ *Preferred Time:*   Morning (9 AM - 12 PM)",
    "🏛️ *Target City:*      Mumbai / Hyderabad",
    "💬 *Notes:*            Test slot booking assistance callback request",
    "🕒 *Time:*             " + testTime,
    "━━━━━━━━━━━━━━━━━━━━",
    "_Visa Slots Updates Lead Engine_"
  ].join("\n");

  console.log("📤 Sending direct test alert to admin: " + adminJid + "...");
  try {
    await client.sendMessage(adminJid, testMsg);
    console.log("✔ Admin test delivered successfully to " + adminJid);
  } catch (err) {
    console.error("❌ Failed to send to admin: " + err.message);
  }
}

async function reportAck(jobId) {
  try {
    const url = `${BACKEND_URL}/api/whatsapp-queue/${jobId}/ack`;
    await axios.post(url, {}, {
      headers: { Authorization: `Bearer ${PUBLISHER_TOKEN}` },
      timeout: 10000,
    });
    console.log(`✔  [Job #${jobId}] Acknowledged by server.\n`);
  } catch (ackErr) {
    console.error(`⚠️ [Job #${jobId}] Ack failed: ${ackErr.message}`);
  }
}

async function reportFail(jobId, errorMsg) {
  try {
    const url = `${BACKEND_URL}/api/whatsapp-queue/${jobId}/fail`;
    await axios.post(
      url,
      { error: String(errorMsg || "Publisher send failed").slice(0, 500) },
      {
        headers: { Authorization: `Bearer ${PUBLISHER_TOKEN}` },
        timeout: 10000,
      }
    );
    console.log(`ℹ️  [Job #${jobId}] Failure reported to server (will retry up to 5 attempts).\n`);
  } catch (failErr) {
    console.error(`⚠️ [Job #${jobId}] Fail report error: ${failErr.message}`);
  }
}

// ---------------------------------------------------------------------------
// GRACEFUL SHUTDOWN
// ---------------------------------------------------------------------------
async function shutdown(reason = "Shutdown") {
  console.log(`\n🛑 [WhatsApp Publisher] ${reason}...`);
  if (pollerTimer) clearTimeout(pollerTimer);
  try {
    await client.destroy();
    console.log("   Client destroyed.");
  } catch {}
  process.exit(0);
}

process.on("SIGINT", () => shutdown("Interrupted (Ctrl+C)"));
process.on("SIGTERM", () => shutdown("Terminated"));

// ---------------------------------------------------------------------------
// START CLIENT
// ---------------------------------------------------------------------------
client.initialize().catch((err) => {
  console.error("❌ Fatal startup error:", err.message);
  process.exit(1);
});


