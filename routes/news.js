const express = require("express");
const router = express.Router();
const News = require("../models/News");
const { normalizeCategory } = require("../utils/categories");
const { requireAdmin } = require("../middleware/auth");
const { str, required, intInRange } = require("../middleware/validate");

// PUBLIC: latest news.
//   GET /api/news
//   GET /api/news?category=H1B/H4      (also matches "General")
//   GET /api/news?limit=6
router.get("/", async (req, res) => {
  const limit = intInRange(req.query.limit, 30, 1, 100);
  const query = { visible: true };
  if (req.query.category && req.query.category !== "General") {
    const group = normalizeCategory(req.query.category);
    query.category = group ? { $in: [group, "General"] } : "General";
  }
  const items = await News.find(query).sort({ publishedAt: -1 }).limit(limit).lean();
  res.json(items);
});

// ADMIN: list everything, including hidden.
router.get("/all", requireAdmin, async (req, res) => {
  const items = await News.find().sort({ publishedAt: -1 }).lean();
  res.json(items);
});

// ADMIN: create.
router.post("/", requireAdmin, async (req, res) => {
  const title = str(req.body.title, 200);
  const summary = str(req.body.summary, 600);
  if (!required(res, { title, summary })) return;

  const item = await News.create({
    title,
    summary,
    body: str(req.body.body, 4000),
    url: str(req.body.url, 500),
    source: str(req.body.source, 120),
    category: str(req.body.category, 20) || "General",
    publishedAt: req.body.publishedAt || new Date(),
  });
  res.status(201).json({ ok: true, id: item._id });
});

// ADMIN: update (edit fields / toggle visible).
router.patch("/:id", requireAdmin, async (req, res) => {
  const allowed = ["title", "summary", "body", "url", "source", "category", "visible", "publishedAt"];
  const patch = {};
  allowed.forEach((k) => {
    if (k in req.body) patch[k] = req.body[k];
  });
  const item = await News.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
  res.json(item);
});

// ADMIN: delete.
router.delete("/:id", requireAdmin, async (req, res) => {
  await News.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
