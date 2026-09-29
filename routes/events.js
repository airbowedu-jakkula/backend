const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const env = require("../config/env");
const Event = require("../models/Event");
const User = require("../models/User");
const MonitorStatus = require("../models/MonitorStatus");
const Update = require("../models/Update");
const { normalizeCategory, CATEGORY_GROUPS } = require("../utils/categories");
const { sendTelegramPhoto, sendTelegramMessage } = require("../utils/telegram");
const { analyzeScreenshotWithVision } = require("../utils/visionAnalyzer");
const { requireAdmin, requireAdminOrExtensionKey } = require("../middleware/auth");
const { eventLimiter } = require("../middleware/rateLimit");
const { str, required, intInRange } = require("../middleware/validate");

function fmtIST(d) {
  return new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function normalizeLocation(loc) {
  if (!loc) return "CHENNAI VAC";
  const s = String(loc).trim();
  const lower = s.toLowerCase();
  if (lower.includes("chennai")) return "CHENNAI VAC";
  if (lower.includes("hyderabad")) return "HYDERABAD VAC";
  if (lower.includes("delhi")) return "NEW DELHI VAC";
  if (lower.includes("mumbai")) return "MUMBAI VAC";
  if (lower.includes("kolkata")) return "KOLKATA VAC";
  if (lower.includes("bengaluru") || lower.includes("bangalore")) return "BENGALURU VAC";
  return s.toUpperCase();
}

async function upsertStatus(category, location, group, patch) {
  const normLoc = normalizeLocation(location);
  const normCat = (category || "Other").trim().toUpperCase();

  try {
    const locRegex = new RegExp(`^${normLoc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const catRegex = new RegExp(`^${normCat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    await MonitorStatus.deleteMany({
      category: catRegex,
      location: locRegex,
      $or: [{ location: { $ne: normLoc } }, { category: { $ne: normCat } }],
    });
  } catch {}

  return MonitorStatus.findOneAndUpdate(
    { category: normCat, location: normLoc },
    { $set: { group, ...patch } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ---------------------------------------------------------------------------
// EXTENSION: a meaningful change was detected.
// ---------------------------------------------------------------------------
router.post("/", eventLimiter, requireAdminOrExtensionKey, async (req, res) => {
  const category = str(req.body.category, 20);
  let location = str(req.body.location, 120);
  const pageType = str(req.body.pageType, 20);
  const previousLocation = str(req.body.previousLocation, 120);
  const capturedBy = str(req.body.capturedBy, 80) || "Partner";
  const capturedByEmail = str(req.body.capturedByEmail, 120) || "";
  const capturedByRole = str(req.body.capturedByRole, 20) || (req.user && req.user.role) || "partner";
  const reason = str(req.body.reason, 40) || "availability-changed";
  // Defence in depth: strip an obvious "group members <names>" run and cap short.
  const clean = (v) =>
    str(String(v || "").replace(/group members?\b[\s\S]*?(?=(calendar|no |appointment|earliest|$))/i, ""), 200);
  let previousAvailability = clean(req.body.previousAvailability);
  let currentAvailability = clean(req.body.currentAvailability);
  let { available, screenshot, detectedAt, telegram } = req.body;
  const screenshotNote = str(req.body.screenshotNote, 200);

  if (!required(res, { category })) return;

  // Drop loading / half-rendered captures.
  const looksLoading =
    !currentAvailability || /loading|please wait|processing|just a moment/i.test(currentAvailability);
  if (looksLoading && !screenshot) {
    console.log(`[events] ignored (loading/empty): ${category} @ ${location || "current"}`);
    return res.json({ ok: true, ignored: "loading" });
  }

  // Drop unwanted / security / login / error captures
  const isUnwantedOrErrorScreen =
    /verifying you are human|malicious bots|just a moment|cloudflare|attention required|sign in|login|dashboard|applicant details|payment receipt|session has expired|session timeout|error has occurred|something went wrong|application error|system error|server error|service unavailable|bad gateway|gateway timeout|access denied|forbidden|request cannot be processed|page expired/i.test(
      currentAvailability || ""
    );
  if (isUnwantedOrErrorScreen) {
    console.log(`[events] ignored (unwanted/security/error screen): ${category} @ ${location || "unknown"}`);
    return res.json({ ok: false, ignored: "unwanted-or-error-page" });
  }

  let earliestDate = str(req.body.earliestDate, 60);
  let slotsCount = str(req.body.slots, 20);
  let totalDatesCount = str(req.body.totalDates, 20);
  let earliestLabel = str(req.body.earliest, 100);

  // Sanitize earliestDate: clean any concatenated month dropdown texts e.g. "15 JanFebMar... 20162017..."
  if (earliestDate && /JanFeb|20162017/i.test(earliestDate)) {
    const dayMatch = earliestDate.match(/^(\d{1,2})/);
    const day = dayMatch ? dayMatch[1].padStart(2, "0") : "15";
    earliestDate = `${day} Sep, ${new Date().getFullYear()}`;
  }

  // Vision AI analysis on backend: extracts location, slots count, open dates count, and earliest date
  if (screenshot) {
    const ai = await analyzeScreenshotWithVision(screenshot);
    if (ai) {
      if (ai.isError || /error/i.test(ai.summary || "")) {
        console.log(`[events] dropped error screenshot analyzed by Vision AI: ${category} @ ${location || "current"}`);
        return res.json({ ok: false, ignored: "error-screenshot" });
      }
      if (ai.summary === "Loading in progress" || ai.summary === "loading") {
        console.log(`[events] dropped in-flight loading screenshot: ${category} @ ${location || "current"}`);
        return res.json({ ok: true, ignored: "loading-screenshot" });
      }
      if (ai.location) location = ai.location;
      if (typeof ai.available === "boolean") available = ai.available;
      if (ai.earliestDate) earliestDate = ai.earliestDate;
      if (ai.slots) slotsCount = ai.slots;
      if (ai.totalDates) totalDatesCount = ai.totalDates;
      if (ai.earliest) earliestLabel = ai.earliest;
      if (ai.summary) currentAvailability = ai.summary;
    }
  }

  // Double check AI or raw parsed date for concatenated strings
  if (earliestDate && /JanFeb|20162017/i.test(earliestDate)) {
    const dayMatch = earliestDate.match(/^(\d{1,2})/);
    const day = dayMatch ? dayMatch[1].padStart(2, "0") : "15";
    earliestDate = `${day} Sep, ${new Date().getFullYear()}`;
  }

  const group = normalizeCategory(category) || "Other";
  const when = detectedAt || new Date();

  function normalizeCanonicalLocation(loc, pt) {
    if (!loc) return pt === "OFC" ? "CHENNAI VAC" : "CHENNAI";
    const s = String(loc).trim().toUpperCase();
    const isVAC = s.includes("VAC") || s.includes("OFC") || pt === "OFC" || s.includes("BIOMETRIC");
    let city = "CHENNAI";
    if (s.includes("HYDERABAD")) city = "HYDERABAD";
    else if (s.includes("MUMBAI")) city = "MUMBAI";
    else if (s.includes("KOLKATA")) city = "KOLKATA";
    else if (s.includes("DELHI")) city = "NEW DELHI";
    else if (s.includes("CHENNAI")) city = "CHENNAI";
    return isVAC ? `${city} VAC` : city;
  }

  const canonicalLoc = normalizeCanonicalLocation(location, pageType);

  console.log(
    `[events] ${reason}: ${category} @ ${canonicalLoc} by ${capturedBy} [${capturedByRole}] (page: ${pageType || "?"}, available: ${available}, date: ${earliestDate}, slots: ${slotsCount}, datesOpen: ${totalDatesCount})`
  );

  const event = await Event.create({
    category,
    group,
    location: canonicalLoc,
    pageType,
    reason,
    previousLocation,
    capturedBy,
    capturedByRole,
    capturedByEmail,
    previousAvailability,
    currentAvailability,
    available: typeof available === "boolean" ? available : null,
    earliestDate,
    slots: slotsCount,
    totalDates: totalDatesCount,
    earliest: earliestLabel,
    screenshotUrl: screenshot || null,
    screenshotNote: screenshot ? "" : screenshotNote,
    detectedAt: when,
  });

  // IMMEDIATELY mirror genuine slot openings to public Update collection for live website overview
  const isAvailableOpening =
    available === true &&
    earliestDate &&
    earliestDate !== "No Dates Available" &&
    earliestDate !== "Checked (No Slots)" &&
    earliestDate !== "N/A" &&
    earliestDate !== "No appointments available" &&
    slotsCount &&
    slotsCount !== "0" &&
    slotsCount !== 0;

  if (isAvailableOpening && (pageType === "OFC" || pageType === "Consular")) {
    try {
      const isVAC = canonicalLoc.includes("VAC");
      await Update.create({
        category: group,
        location: canonicalLoc,
        type: `${group} (Regular)`,
        date: earliestDate,
        count: slotsCount,
        totalDates: totalDatesCount || "1",
        note: `Verified ${isVAC ? "OFC/VAC" : "Consulate"} slot detection for ${group} @ ${canonicalLoc}`,
        screenshotUrl: screenshot || null,
        source: "extension",
        capturedAt: when,
      });
      console.log(`[events] ⚡ Public website overview updated immediately for ${group} @ ${canonicalLoc}`);
    } catch (err) {
      console.error("[events] Live update sync error:", err.message);
    }
  }

  if (capturedByEmail) {
    User.findOneAndUpdate({ email: capturedByEmail.toLowerCase() }, { lastActiveAt: new Date() }).catch(() => {});
  }

  await upsertStatus(category, canonicalLoc, group, {
    lastStatus: available === true ? "available" : available === false ? "unavailable" : "changed",
    available: typeof available === "boolean" ? available : null,
    lastCheckedAt: new Date(),
    lastChangeAt: event.detectedAt,
  });

  const delayMins = 10;
  const delayMs = delayMins * 60 * 1000;

  const alertPayload = {
    category,
    group,
    location: canonicalLoc,
    locStr: canonicalLoc || "All Centers",
    pageType,
    reason,
    previousLocation,
    currentAvailability,
    available,
    earliestDate,
    slots: slotsCount,
    totalDates: totalDatesCount,
    screenshot,
    screenshotNote,
    when,
    earliestStr: earliestLabel,
    telegram: !!telegram,
    delayMins,
  };

  if (delayMs > 0) {
    console.log(
      `[events] ⏳ ${delayMins}-Minute Delay Active: Queuing broadcast for ${category} @ ${location || "current"} (Will dispatch at ${new Date(
        Date.now() + delayMs
      ).toLocaleTimeString()})`
    );
    setTimeout(() => {
      publishAlert(alertPayload).catch((err) =>
        console.error("[events] Delayed alert publication error:", err.message)
      );
    }, delayMs);
  } else {
    publishAlert(alertPayload).catch((err) =>
      console.error("[events] Alert publication error:", err.message)
    );
  }

  res.status(201).json({ ok: true, id: event._id, delayedMinutes: delayMins });
});

async function publishAlert({
  category,
  group,
  location,
  locStr,
  pageType,
  reason,
  previousLocation,
  currentAvailability,
  available,
  earliestDate,
  slots,
  totalDates,
  screenshot,
  screenshotNote,
  when,
  earliestStr,
  telegram,
  delayMins,
}) {
  // Alerts to Telegram
  if (telegram) {
    const timeStr = fmtIST(when) + " IST";
    const delayNotice = "10 Minutes (Sent after 10 mins)";
    const delayLine = `⏳ Feed Delay:          10 Minutes (Sent after 10 mins)\n⚠️ Note:                Screenshot captured 10 mins ago\n`;
    const isAvailable =
      available === true &&
      earliestDate &&
      earliestDate !== "No Dates Available" &&
      earliestDate !== "Checked (No Slots)" &&
      earliestDate !== "N/A" &&
      slots &&
      slots !== "0" &&
      slots !== 0;

    let caption;
    if (isAvailable) {
      const dateDisplay = earliestDate || earliestStr || currentAvailability || "Available";
      const slotsDisplay = slots && slots !== "0" && slots !== "N/A" ? `${slots} Slots Available` : "Available";
      const totalDisplay = totalDates && totalDates !== "0" ? `${totalDates} Dates Open` : "Open";

      caption =
        `🇺🇸 US VISA APPOINTMENT ALERT\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🟢 STATUS: SLOTS OPEN & AVAILABLE\n\n` +
        `📋 Visa Class:          ${category}\n` +
        `📍 Center:              ${locStr}\n` +
        `📅 Earliest Date:       ${dateDisplay}\n` +
        `🔢 Slots on Date:       ${slotsDisplay}\n` +
        `📊 Total Dates Open:    ${totalDisplay}\n` +
        `🕒 Detected At:         ${timeStr}\n` +
        delayLine +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 Track Live: usvisaslotsupdate.com`;
    } else {
      caption =
        `🇺🇸 US VISA APPOINTMENT UPDATE\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔴 STATUS: No Slots Currently Available\n\n` +
        `📋 Visa Class:          ${category}\n` +
        `📍 Center:              ${locStr}\n` +
        `📅 Earliest Date:       No Dates Available\n` +
        `🔢 Slots Available:     0\n` +
        `📊 Total Dates Open:    0\n` +
        `🕒 Checked At:          ${timeStr}\n` +
        delayLine +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🛰️ 24/7 Automated Consular Scanner Active\n` +
        `🌐 Track Live: usvisaslotsupdate.com`;
    }

    try {
      if (screenshot) {
        console.log(`[events] Dispatching Telegram photo alert for ${category} @ ${locStr} (${group}) [${delayNotice}]`);
        await sendTelegramPhoto(screenshot, caption, group);
      } else {
        console.log(`[events] Dispatching Telegram text alert for ${category} (${group}) [${delayNotice}]`);
        await sendTelegramMessage(caption, group);
      }
    } catch (tgErr) {
      console.error("[events] Telegram send failed:", tgErr.message);
      if (screenshot) {
        try {
          await sendTelegramMessage(caption + "\n(Photo dispatch failed, alert sent as text)", group);
        } catch {}
      }
    }
  }
}

// EXTENSION: periodic "I checked, nothing changed" ping.
router.post("/heartbeat", eventLimiter, requireAdminOrExtensionKey, async (req, res) => {
  const category = str(req.body.category, 20);
  const location = str(req.body.location, 120);
  const { available, status } = req.body;
  if (!required(res, { category })) return;

  const group = normalizeCategory(category) || "Other";
  console.log(`[events] heartbeat: ${category} @ ${location || "current"} (${status || "no-change"})`);
  await upsertStatus(category, location, group, {
    lastCheckedAt: new Date(),
    lastStatus: str(status, 20) || "no-change",
    available: typeof available === "boolean" ? available : null,
  });
  res.json({ ok: true });
});

// DASHBOARD: current live status table (deduplicated by category + canonical location).
router.get("/monitor", requireAdmin, async (req, res) => {
  try {
    const raw = await MonitorStatus.find().sort({ lastChangeAt: -1, lastCheckedAt: -1 }).lean();
    
    // Deduplicate in memory and canonicalize
    const map = new Map();
    for (const r of raw) {
      const canonCat = (r.category || "Other").trim().toUpperCase();
      const canonLoc = normalizeLocation(r.location);
      const key = `${canonCat}::${canonLoc}`;
      
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...r, category: canonCat, location: canonLoc });
      } else {
        const curTime = new Date(r.lastCheckedAt || 0).getTime();
        const exTime = new Date(existing.lastCheckedAt || 0).getTime();
        if (curTime > exTime) {
          map.set(key, { ...r, category: canonCat, location: canonLoc });
        }
      }
    }
    
    const deduplicated = Array.from(map.values()).sort((a, b) => {
      const ta = new Date(a.lastCheckedAt || 0).getTime();
      const tb = new Date(b.lastCheckedAt || 0).getTime();
      return tb - ta;
    });

    res.json(deduplicated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DASHBOARD: clear stale or reset monitoring status rows.
router.delete("/monitor", requireAdmin, async (req, res) => {
  try {
    await MonitorStatus.deleteMany({});
    res.json({ ok: true, message: "Live scanner monitoring status reset successfully." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DASHBOARD: partner activity and live stats summary.
router.get("/partners-summary", requireAdmin, async (req, res) => {
  try {
    const partners = await User.find({ role: { $ne: "admin" } })
      .select("email name role status createdAt lastActiveAt partnerNote")
      .sort({ createdAt: -1 })
      .lean();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const stats = await Promise.all(
      partners.map(async (p) => {
        const totalScreenshots = await Event.countDocuments({
          $or: [{ capturedByEmail: p.email.toLowerCase() }, { capturedBy: p.name || p.email }],
          screenshotUrl: { $nin: [null, ""] },
        });

        const todayScreenshots = await Event.countDocuments({
          $or: [{ capturedByEmail: p.email.toLowerCase() }, { capturedBy: p.name || p.email }],
          screenshotUrl: { $nin: [null, ""] },
          detectedAt: { $gte: startOfToday },
        });

        const latestEvent = await Event.findOne({
          $or: [{ capturedByEmail: p.email.toLowerCase() }, { capturedBy: p.name || p.email }],
        })
          .sort({ detectedAt: -1 })
          .select("category location pageType available detectedAt hasScreenshot")
          .lean();

        return {
          ...p,
          totalScreenshots,
          todayScreenshots,
          latestEvent,
        };
      })
    );

    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DASHBOARD: event history with role and partner email filters.
router.get("/", requireAdmin, async (req, res) => {
  const days = intInRange(req.query.days, 7, 1, 60);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const match = { detectedAt: { $gte: since } };

  if (req.query.category) match.category = String(req.query.category);
  if (req.query.location) match.location = new RegExp(String(req.query.location), "i");
  if (req.query.role === "partner") {
    match.$or = [
      { capturedByRole: { $in: ["partner", "user"] } },
      { capturedByRole: { $exists: false } },
      { capturedBy: { $nin: ["admin", "Admin", "ADMIN", "Administrator", "system", "System"] } },
    ];
  } else if (req.query.role === "admin") {
    match.$or = [
      { capturedByRole: "admin" },
      { capturedBy: { $in: ["admin", "Admin", "ADMIN", "Administrator", "system", "System"] } },
    ];
  }
  if (req.query.email) {
    const emailStr = String(req.query.email).toLowerCase();
    match.$or = [{ capturedByEmail: emailStr }, { capturedBy: new RegExp(`^${emailStr}$`, "i") }];
  }

  const events = await Event.aggregate([
    { $match: match },
    { $sort: { detectedAt: -1 } },
    { $limit: 300 },
    {
      $addFields: {
        hasScreenshot: {
          $and: [{ $ne: ["$screenshotUrl", null] }, { $ne: ["$screenshotUrl", ""] }],
        },
      },
    },
    { $project: { screenshotUrl: 0 } },
  ]);
  res.json(events);
});

// DASHBOARD: one event's screenshot. Accepts the admin JWT in the Authorization
// header OR a ?token= query param (so it works as an <img src>).
router.get("/:id/screenshot", async (req, res) => {
  const token =
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.query.token || "");
  try {
    if (jwt.verify(token, env.jwtSecret).role !== "admin") throw new Error("not admin");
  } catch {
    return res.status(401).end();
  }
  let doc;
  try {
    doc = await Event.findById(req.params.id).select("screenshotUrl").lean();
  } catch {
    return res.status(400).end();
  }
  const m = doc && /^data:(image\/[\w+.-]+);base64,(.+)$/s.exec(doc.screenshotUrl || "");
  if (!m) return res.status(404).end();
  res.set("Content-Type", m[1]);
  res.set("Cache-Control", "private, max-age=86400");
  // allow the dashboard (different origin) to embed this image
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.send(Buffer.from(m[2], "base64"));
});

// DASHBOARD: wipe all change events (does not touch the status table).
router.delete("/", requireAdmin, async (req, res) => {
  const { deletedCount } = await Event.deleteMany({});
  res.json({ ok: true, deleted: deletedCount });
});

// DASHBOARD: delete an event.
router.delete("/:id", requireAdmin, async (req, res) => {
  await Event.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
