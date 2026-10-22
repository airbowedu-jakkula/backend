const express = require("express");
const router = express.Router();
const Contact = require("../models/Contact");
const WhatsAppJob = require("../models/WhatsAppJob");
const env = require("../config/env");
const { sendScheduleCallAdminAlert } = require("../utils/mailer");
const { requireAdmin } = require("../middleware/auth");
const { publicWriteLimiter } = require("../middleware/rateLimit");
const { str, required } = require("../middleware/validate");

async function dispatchAdminNotifications(contact) {
  // 1. Email notification to admin (non-blocking)
  sendScheduleCallAdminAlert(contact).catch((err) => {
    console.warn("[Contacts] Mailer alert notification error:", err.message);
  });

  // 2. WhatsApp notification directly to admin's WhatsApp number (8143852523)
  try {
    const adminRecipient = env.adminWhatsApp || "918143852523@c.us";
    const dedupeKey = `call-lead-${contact._id}`;
    const timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";

    const adminWhatsAppMsg = [
      "🚨 *NEW VISA SLOT BOOKING CALL REQUEST*",
      "━━━━━━━━━━━━━━━━━━━━",
      `👤 *Client Name:*      ${contact.name}`,
      `📞 *Mobile:*           ${contact.mobile}`,
      `📋 *Visa Category:*    ${contact.category || "General / All"}`,
      `⏰ *Preferred Time:*   ${contact.preferredTime || "Anytime / Urgent"}`,
      `🏛️ *Target Centers:*   ${contact.targetCity || "Any Center"}`,
      `💬 *Client Notes:*     ${contact.message || "Direct callback requested for slot booking assistance."}`,
      `🕒 *Requested At:*     ${timeStr}`,
      "━━━━━━━━━━━━━━━━━━━━",
      "_Visa Slots Updates Lead Engine_",
    ].join("\n");

    await WhatsAppJob.create({
      dedupeKey,
      category: contact.category || "Booking Assistance",
      group: "ADMIN",
      recipient: adminRecipient,
      customText: adminWhatsAppMsg,
      scheduledAt: new Date(),
      status: "pending",
    });

    console.log(`✔ [Contacts] WhatsApp notification queued for admin: ${adminRecipient}`);
  } catch (err) {
    console.error("❌ [Contacts] Failed to enqueue WhatsApp admin notification:", err.message);
  }
}

// PUBLIC: Client schedules a direct call for slot booking assistance
router.post("/schedule-call", publicWriteLimiter, async (req, res) => {
  const name = str(req.body.name, 120);
  const mobile = str(req.body.mobile, 40);
  const email = str(req.body.email, 160);
  const category = str(req.body.category, 60) || "General";
  const preferredTime = str(req.body.preferredTime, 80) || "Anytime";
  const targetCity = str(req.body.targetCity, 100) || "Any Center";
  const message = str(req.body.message, 2000);

  if (!name || !mobile) {
    return res.status(400).json({ ok: false, error: "Name and Mobile number are required" });
  }

  const contact = await Contact.create({
    name,
    mobile,
    email,
    category,
    preferredTime,
    targetCity,
    message,
    type: "schedule-call",
  });

  // Dispatch both email and WhatsApp alerts to admin
  await dispatchAdminNotifications(contact);

  res.status(201).json({
    ok: true,
    message: "Your callback request has been received. Our slot booking specialist will call you directly.",
    id: contact._id,
  });
});

// PUBLIC: Standard contact form submission
router.post("/", publicWriteLimiter, async (req, res) => {
  const name = str(req.body.name, 120);
  const mobile = str(req.body.mobile, 40);
  const email = str(req.body.email, 160);
  const category = str(req.body.category, 60) || "General";
  const preferredTime = str(req.body.preferredTime, 80) || "Anytime";
  const targetCity = str(req.body.targetCity, 100) || "Any Center";
  const message = str(req.body.message, 2000);

  if (!required(res, { name, mobile })) return;

  const contact = await Contact.create({
    name,
    mobile,
    email,
    category,
    preferredTime,
    targetCity,
    message,
    type: req.body.type === "schedule-call" ? "schedule-call" : "general-contact",
  });

  // Dispatch notifications for all inbound booking/contact leads
  await dispatchAdminNotifications(contact);

  res.status(201).json({ ok: true, id: contact._id });
});

// ADMIN: list all contact & schedule call requests
router.get("/", requireAdmin, async (req, res) => {
  const contacts = await Contact.find().sort({ createdAt: -1 }).lean();
  res.json(contacts);
});

// ADMIN: mark handled / unhandled
router.patch("/:id", requireAdmin, async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(
    req.params.id,
    { handled: Boolean(req.body.handled) },
    { new: true }
  );
  res.json(contact);
});

// ADMIN: delete
router.delete("/:id", requireAdmin, async (req, res) => {
  await Contact.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
