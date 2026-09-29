const mongoose = require("mongoose");
const { CATEGORY_GROUPS } = require("../utils/categories");

// Admin-curated news / information items shown on the landing page.
const NEWS_CATEGORIES = ["General", ...CATEGORY_GROUPS];

const newsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    summary: { type: String, required: true }, // 1–3 sentences shown on the card
    body: String, // optional longer text
    url: String, // optional "read more" link (official source)
    source: String, // optional source name, e.g. "travel.state.gov"
    category: { type: String, enum: NEWS_CATEGORIES, default: "General" },
    visible: { type: Boolean, default: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

newsSchema.index({ visible: 1, publishedAt: -1 });

module.exports = mongoose.model("News", newsSchema);
module.exports.NEWS_CATEGORIES = NEWS_CATEGORIES;
