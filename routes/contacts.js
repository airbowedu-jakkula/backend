const express = require("express");
const router = express.Router();
const Contact = require("../models/Contact");
const { requireAdmin } = require("../middleware/auth");
const { publicWriteLimiter } = require("../middleware/rateLimit");
const { str, required } = require("../middleware/validate");

// PUBLIC: a client submits their contact details.
router.post("/", publicWriteLimiter, async (req, res) => {
  const name = str(req.body.name, 120);
  const mobile = str(req.body.mobile, 40);
  const email = str(req.body.email, 160);
  const message = str(req.body.message, 2000);

  if (!required(res, { name, mobile, email })) return;

  await Contact.create({ name, mobile, email, message });
  res.status(201).json({ ok: true });
});

// ADMIN: list all contact requests.
router.get("/", requireAdmin, async (req, res) => {
  const contacts = await Contact.find().sort({ createdAt: -1 }).lean();
  res.json(contacts);
});

// ADMIN: mark handled / unhandled.
router.patch("/:id", requireAdmin, async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(
    req.params.id,
    { handled: Boolean(req.body.handled) },
    { new: true }
  );
  res.json(contact);
});

// ADMIN: delete.
router.delete("/:id", requireAdmin, async (req, res) => {
  await Contact.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
