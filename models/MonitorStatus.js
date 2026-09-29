const mongoose = require("mongoose");

// Live status row per (category, location) for the monitoring dashboard table.
const monitorStatusSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    location: { type: String, default: "current" },
    group: String,
    // "changed" | "no-change" | "available" | "unavailable"
    lastStatus: { type: String, default: "no-change" },
    available: { type: Boolean, default: null },
    lastCheckedAt: { type: Date, default: Date.now },
    lastChangeAt: Date,
  },
  { timestamps: true }
);

monitorStatusSchema.index({ category: 1, location: 1 }, { unique: true });

module.exports = mongoose.model("MonitorStatus", monitorStatusSchema);
