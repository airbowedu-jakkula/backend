const mongoose = require("mongoose");

const whatsappJobSchema = new mongoose.Schema(
  {
    dedupeKey: { type: String, required: true, unique: true, index: true },
    category: { type: String, required: true },
    group: { type: String, enum: ["F1/F2", "B1/B2", "H1B/H4", "ADMIN"], required: true },
    recipient: { type: String, default: "" }, // Direct user/admin JID e.g. "918143852523@c.us"
    customText: { type: String, default: "" }, // Override message body for direct admin alerts / custom jobs
    location: { type: String, default: "Unknown location" },
    pageType: { type: String, default: "" },
    earliestDate: { type: String, default: "" },
    slots: { type: String, default: "" },
    totalDates: { type: String, default: "" },
    screenshot: { type: String, default: null },
    detectedAt: { type: Date, default: Date.now },
    scheduledAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["pending", "sending", "sent", "failed"], default: "pending", index: true },
    attempts: { type: Number, default: 0 },
    leaseUntil: { type: Date, default: null, index: true },
    sentAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true }
);

// Keep deduplication records for seven days; the same slot can be reported again later.
whatsappJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
whatsappJobSchema.index({ status: 1, scheduledAt: 1, leaseUntil: 1 });

module.exports = mongoose.model("WhatsAppJob", whatsappJobSchema);
