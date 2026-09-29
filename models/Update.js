const mongoose = require("mongoose");
const { CATEGORY_GROUPS } = require("../utils/categories");

const updateSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    location: String,
    type: String,
    date: String,
    count: String,
    totalDates: String,
    note: String,
    screenshotUrl: String,
    source: { type: String, enum: ["dashboard", "extension"], default: "dashboard" },
    capturedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

updateSchema.index({ category: 1, capturedAt: -1 });

module.exports = mongoose.model("Update", updateSchema);
