const express = require("express");
const crypto = require("crypto");
const WhatsAppJob = require("../models/WhatsAppJob");
const env = require("../config/env");

const router = express.Router();

function safeTokenMatch(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requirePublisher(req, res, next) {
  if (!env.whatsapp.publisherToken) {
    return res.status(503).json({ ok: false, error: "WhatsApp publisher is not configured" });
  }
  const header = String(req.headers.authorization || "");
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!safeTokenMatch(provided, env.whatsapp.publisherToken)) {
    return res.status(401).json({ ok: false, error: "Unauthorized publisher" });
  }
  next();
}

// Publisher claims one due job. A lease allows recovery if the publisher crashes.
router.get("/next", requirePublisher, async (req, res) => {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 2 * 60 * 1000);
  const job = await WhatsAppJob.findOneAndUpdate(
    {
      scheduledAt: { $lte: now },
      attempts: { $lt: 5 },
      $or: [
        { status: "pending" },
        { status: "sending", leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: { status: "sending", leaseUntil, lastError: "" },
      $inc: { attempts: 1 },
    },
    { sort: { scheduledAt: 1, createdAt: 1 }, new: true }
  ).lean();

  if (!job) return res.status(204).end();

  let text = job.customText;
  if (!text) {
    const date = job.earliestDate || "Check appointment portal";
    const slotCount =
      job.slots && job.slots !== "0" && job.slots !== "N/A"
        ? `${job.slots} Slots Available`
        : "Slots Available";
    const totalDisplay = job.totalDates && job.totalDates !== "0" ? `${job.totalDates} Dates Open` : null;
    const timeStr = new Date(job.detectedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";
    const delayMins = env.alertDelayMinutes || 5;
    const delayLine =
      delayMins > 0
        ? `*⏳ Feed Delay:*          ${delayMins} Minutes`
        : "";

    text = [
      "🇺🇸 *US VISA APPOINTMENT ALERT*",
      "━━━━━━━━━━━━━━━━━━━━",
      "🟢 *STATUS: SLOTS OPEN & AVAILABLE*",
      "",
      `📋 *Visa Class:*          ${job.category} (${job.group})`,
      `📍 *Center:*              ${job.location}`,
      `📅 *Earliest Date:*       ${date}`,
      `🔢 *Slots on Date:*       ${slotCount}`,
      totalDisplay ? `📊 *Total Dates Open:*    ${totalDisplay}` : null,
      `🕒 *Detected At:*         ${timeStr}`,
      delayLine || null,
      "━━━━━━━━━━━━━━━━━━━━",
      "🌐 *Track Live:* usvisaslotsupdate.com",
      "📞 *For Slot Bookings Contact:* 8143852523",
      "_Visa Slots Updates_",
    ]
      .filter(Boolean)
      .join("\n");
  }

  res.json({
    ok: true,
    job: {
      id: String(job._id),
      category: job.category,
      group: job.group,
      location: job.location,
      earliestDate: job.earliestDate || "",
      slots: job.slots || "",
      totalDates: job.totalDates || "",
      screenshot: job.screenshot || null,
      recipient: job.recipient || "",
      text,
      attempts: job.attempts,
      leaseUntil: job.leaseUntil,
    },
  });
});

// Queue status & monitoring stats
router.get("/status", requirePublisher, async (req, res) => {
  const [pending, sending, sent, failed] = await Promise.all([
    WhatsAppJob.countDocuments({ status: "pending" }),
    WhatsAppJob.countDocuments({ status: "sending" }),
    WhatsAppJob.countDocuments({ status: "sent" }),
    WhatsAppJob.countDocuments({ status: "failed" }),
  ]);
  const nextJob = await WhatsAppJob.findOne({ status: "pending" })
    .sort({ scheduledAt: 1 })
    .select("scheduledAt group location category earliestDate")
    .lean();
  res.json({
    ok: true,
    stats: { pending, sending, sent, failed },
    nextScheduledJob: nextJob || null,
  });
});

// Enqueue a safe test alert job for immediate delivery
router.post("/test-job", requirePublisher, async (req, res) => {
  const group = req.body.group || "F1/F2";
  if (!["F1/F2", "B1/B2", "H1B/H4"].includes(group)) {
    return res.status(400).json({ ok: false, error: "Invalid group. Must be F1/F2, B1/B2, or H1B/H4" });
  }

  const dedupeKey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = await WhatsAppJob.create({
    dedupeKey,
    category: req.body.category || group,
    group,
    location: req.body.location || "MUMBAI VAC",
    pageType: "OFC",
    earliestDate: req.body.earliestDate || "15 Nov 2026",
    slots: req.body.slots || "25",
    totalDates: req.body.totalDates || "4",
    detectedAt: new Date(),
    scheduledAt: new Date(), // Immediate for tests
    status: "pending",
    attempts: 0,
  });

  res.json({
    ok: true,
    jobId: String(job._id),
    group: job.group,
    message: `Test alert job queued for ${group} and scheduled for immediate WhatsApp delivery`,
  });
});

router.post("/:id/ack", requirePublisher, async (req, res) => {
  const job = await WhatsAppJob.findOneAndUpdate(
    { _id: req.params.id, status: "sending" },
    { $set: { status: "sent", sentAt: new Date(), leaseUntil: null, lastError: "" } },
    { new: true }
  ).select("_id status sentAt").lean();
  if (!job) return res.status(404).json({ ok: false, error: "Job not found or not leased" });
  res.json({ ok: true, job });
});

router.post("/:id/fail", requirePublisher, async (req, res) => {
  const message = String((req.body && req.body.error) || "Publisher failed").slice(0, 500);
  const job = await WhatsAppJob.findById(req.params.id);
  if (!job || job.status !== "sending") {
    return res.status(404).json({ ok: false, error: "Job not found or not leased" });
  }
  job.lastError = message;
  job.leaseUntil = null;
  job.status = job.attempts >= 5 ? "failed" : "pending";
  await job.save();
  res.json({ ok: true, status: job.status, attempts: job.attempts });
});

module.exports = router;
