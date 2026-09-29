const express = require("express");
const router = express.Router();
const Update = require("../models/Update");
const Event = require("../models/Event");
const { sendTelegramPhoto } = require("../utils/telegram");
const { normalizeCategory, CATEGORY_GROUPS } = require("../utils/categories");
const { requireAdmin, requireAdminOrExtensionKey } = require("../middleware/auth");
const { str, intInRange } = require("../middleware/validate");

// PUBLIC: list updates for the landing page.
//   GET /api/updates?category=B1/B2&days=14
// Screenshots are NOT included here (they're ~70 KB base64 each and make the
// response tens of MB); the client loads each image from /:id/screenshot.
router.get("/", async (req, res) => {
  const days = intInRange(req.query.days, 14, 1, 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const match = { capturedAt: { $gte: since } };
  if (req.query.category) {
    const group = normalizeCategory(req.query.category);
    if (!group) return res.status(400).json({ error: "Unknown category" });
    match.category = group;
  }
  const updates = await Update.aggregate([
    { $match: match },
    { $sort: { capturedAt: -1 } },
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
  res.json(updates);
});

// PUBLIC: one update's screenshot, served as an image and cached hard.
router.get("/:id/screenshot", async (req, res) => {
  let doc;
  try {
    doc = await Update.findById(req.params.id).select("screenshotUrl").lean();
    if (!doc || !doc.screenshotUrl) {
      doc = await Event.findById(req.params.id).select("screenshotUrl").lean();
    }
  } catch {
    return res.status(400).end();
  }
  const m = doc && /^data:(image\/[\w+.-]+);base64,(.+)$/s.exec(doc.screenshotUrl || "");
  if (!m) return res.status(404).end();
  res.set("Content-Type", m[1]);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  // allow the website (different origin) to embed this image — helmet defaults
  // this to same-origin, which blocks the <img> tag on the dashboard/board
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.send(Buffer.from(m[2], "base64"));
});

// PUBLIC: counts per group for the last N days.
router.get("/summary", async (req, res) => {
  const days = intInRange(req.query.days, 14, 1, 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await Update.aggregate([
    { $match: { capturedAt: { $gte: since } } },
    { $group: { _id: "$category", count: { $sum: 1 }, latest: { $max: "$capturedAt" } } },
  ]);
  const summary = {};
  CATEGORY_GROUPS.forEach((g) => (summary[g] = { count: 0, latest: null }));
  rows.forEach((r) => (summary[r._id] = { count: r.count, latest: r.latest }));
  res.json(summary);
});

// PUBLIC: latest availability table overview per category and location
router.get("/overview", async (req, res) => {
  try {
    // Purge any stale/corrupted error records from database asynchronously
    Update.deleteMany({
      $or: [
        { date: { $regex: /error|denied|timeout|loading|unwanted|no dates|checked|no appointments|^available$|^n\/a$/i } },
        { count: { $in: ["0", 0, "N/A", "-", "", null] } },
        { note: { $regex: /error|denied|timeout|loading|unwanted/i } },
        { screenshotUrl: { $in: [null, ""] } },
      ],
    }).catch(() => {});

    Event.deleteMany({
      $or: [
        { earliestDate: { $regex: /error|denied|timeout|loading|unwanted|no dates|checked|no appointments|^available$|^n\/a$/i } },
        { slots: { $in: ["0", 0, "N/A", "-", "", null] } },
        { currentAvailability: { $regex: /error|denied|timeout|loading|unwanted/i } },
      ],
    }).catch(() => {});

    const invalidDatePattern = /error|denied|timeout|loading|unwanted|no dates|checked|no appointments|^available$|^n\/a$/i;
    const invalidCounts = ["0", 0, "N/A", "-", "", null];

    const latestUpdates = await Update.aggregate([
      {
        $match: {
          date: { $exists: true, $ne: "", $not: invalidDatePattern },
          count: { $nin: invalidCounts },
          screenshotUrl: { $exists: true, $ne: null, $ne: "" },
          note: { $not: /error|denied|timeout|loading|unwanted/i },
        },
      },
      { $sort: { capturedAt: -1 } },
      {
        $group: {
          _id: { category: "$category", location: "$location" },
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { capturedAt: -1 } },
    ]);

    const latestEvents = await Event.aggregate([
      {
        $match: {
          available: true,
          earliestDate: { $exists: true, $ne: "", $not: invalidDatePattern },
          slots: { $nin: invalidCounts },
          screenshotUrl: { $exists: true, $ne: null, $ne: "" },
          previousAvailability: { $not: /error/i },
          currentAvailability: { $not: /error|denied|timeout|loading|unwanted/i },
        },
      },
      { $sort: { detectedAt: -1 } },
      {
        $group: {
          _id: { group: "$group", location: "$location" },
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { detectedAt: -1 } },
    ]);

    const grouped = {};

    for (const u of latestUpdates) {
      const cat = u.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({
        location: u.location || "General",
        type: u.type || `${cat} (Regular)`,
        earliestDate: u.date,
        slots: u.count != null ? String(u.count) : "1",
        totalDates: u.totalDates != null ? String(u.totalDates) : "1",
        lastSeen: u.capturedAt,
        customScreenshot: u.screenshotUrl || null,
        screenshotId: u._id,
      });
    }

    for (const ev of latestEvents) {
      const cat = ev.group || ev.category;
      if (!grouped[cat]) grouped[cat] = [];
      const evItem = {
        location: ev.location,
        type: `${cat} (Regular)`,
        earliestDate: ev.earliestDate,
        slots: ev.slots || "1",
        totalDates: ev.totalDates || "1",
        lastSeen: ev.detectedAt,
        customScreenshot: ev.screenshotUrl || null,
        screenshotId: ev._id,
      };
      const existingIdx = grouped[cat].findIndex((r) => r.location === ev.location);
      if (existingIdx >= 0) {
        const existingLastSeen = new Date(grouped[cat][existingIdx].lastSeen || 0).getTime();
        const evLastSeen = new Date(ev.detectedAt).getTime();
        if (evLastSeen >= existingLastSeen) {
          grouped[cat][existingIdx] = evItem;
        }
      } else {
        grouped[cat].push(evItem);
      }
    }

    res.json({ ok: true, data: grouped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PROTECTED: create an update (admin dashboard, or extension x-api-key).
router.post("/", requireAdminOrExtensionKey, async (req, res) => {
  const group = normalizeCategory(req.body.category);
  if (!group || !CATEGORY_GROUPS.includes(group)) {
    return res.status(400).json({ error: "category must map to B1/B2, F1/F2, or H1B/H4" });
  }
  const location = str(req.body.location, 120);
  const date = str(req.body.date, 120);
  const count = str(req.body.count, 40);
  const note = str(req.body.note, 1000);
  const { screenshot, capturedAt } = req.body;

  const update = await Update.create({
    category: group,
    location,
    date,
    count,
    note,
    screenshotUrl: screenshot || null,
    source: req.viaExtension ? "extension" : "dashboard",
    capturedAt: capturedAt || new Date(),
  });

  if (screenshot) {
    const delayMins = typeof env.alertDelayMinutes === "number" ? env.alertDelayMinutes : 10;
    const delayMs = delayMins * 60 * 1000;
    const delayNotice = delayMins > 0 ? `⏳ Feed Delay: 10 Minutes (Screenshot sent after 10 mins)\n⚠️ Note: Screenshot captured 10 mins ago` : null;

    const caption = [
      `🇺🇸 US VISA APPOINTMENT UPDATE`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📋 Category: ${group}`,
      location ? `📍 Location: ${location}` : null,
      date ? `📅 Date: ${date}` : null,
      count ? `🔢 Slots: ${count}` : null,
      note ? `📝 Note: ${note}` : null,
      delayNotice,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🌐 Track Live: usvisaslotsupdate.com`,
    ]
      .filter(Boolean)
      .join("\n");

    if (delayMs > 0) {
      console.log(`[updates] ⏳ 10-Minute Delay Active: Queuing Telegram photo for ${group} @ ${location} (Will send in 10 mins)`);
      setTimeout(() => {
        sendTelegramPhoto(screenshot, caption, group).catch((e) =>
          console.error("[updates] Delayed Telegram send failed:", e.message)
        );
      }, delayMs);
    } else {
      try {
        await sendTelegramPhoto(screenshot, caption, group);
      } catch (e) {
        console.error("[updates] Telegram send failed:", e.message);
      }
    }
  }

  res.status(201).json({ ok: true, id: update._id });
});

// PROTECTED: delete an update (admin only).
router.delete("/:id", requireAdmin, async (req, res) => {
  await Update.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// CLEANUP: purge invalid, error, or zero-slot updates from DB
router.post("/cleanup", requireAdminOrExtensionKey, async (req, res) => {
  try {
    const invalidDateValues = [
      "No Dates Available",
      "N/A",
      "Checked (No Slots)",
      "No appointments available",
      "Available",
      "Portal error page",
      "",
    ];
    const invalidCounts = ["0", 0, "N/A", "-", "", null];

    const delUpdates = await Update.deleteMany({
      $or: [
        { date: { $in: invalidDateValues } },
        { count: { $in: invalidCounts } },
        { note: /error|denied|timeout|loading|unwanted/i },
        { screenshotUrl: { $in: [null, ""] } },
      ],
    });

    res.json({ ok: true, deletedUpdates: delUpdates.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
