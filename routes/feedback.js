const express = require("express");
const router = express.Router();
const Feedback = require("../models/Feedback");
const { requireAdmin } = require("../middleware/auth");
const { publicWriteLimiter } = require("../middleware/rateLimit");
const { str, required } = require("../middleware/validate");

// PUBLIC: list visible feedback.
//   GET /api/feedback                 -> all visible feedback (newest first)
//   GET /api/feedback?successStory=1  -> only success stories
router.get("/", async (req, res) => {
  const query = { visible: true };
  if (req.query.successStory === "1" || req.query.successStory === "true") {
    query.isSuccessStory = true;
  }
  const items = await Feedback.find(query).sort({ createdAt: -1 }).limit(200).lean();
  res.json(items);
});

// PUBLIC: submit feedback. Auto-published (visible: true by default).
router.post("/", publicWriteLimiter, async (req, res) => {
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 160);
  const message = str(req.body.message, 3000);
  if (!required(res, { name, message })) return;

  const rating = req.body.rating ? Math.max(1, Math.min(5, Number(req.body.rating))) : undefined;

  const item = await Feedback.create({ name, email, rating, message });
  res.status(201).json({ ok: true, id: item._id });
});

// ADMIN: list everything, including hidden.
router.get("/all", requireAdmin, async (req, res) => {
  const items = await Feedback.find().sort({ createdAt: -1 }).lean();
  res.json(items);
});

// ADMIN: toggle visibility / success-story flag.
router.patch("/:id", requireAdmin, async (req, res) => {
  const patch = {};
  if ("visible" in req.body) patch.visible = Boolean(req.body.visible);
  if ("isSuccessStory" in req.body) patch.isSuccessStory = Boolean(req.body.isSuccessStory);
  const item = await Feedback.findByIdAndUpdate(req.params.id, patch, { new: true });
  res.json(item);
});

// ADMIN: delete.
router.delete("/:id", requireAdmin, async (req, res) => {
  await Feedback.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
