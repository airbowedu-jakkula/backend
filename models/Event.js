const mongoose = require("mongoose");

// A single detected change reported by the monitoring extension.
const eventSchema = new mongoose.Schema(
  {
    category: { type: String, required: true }, // granular, e.g. "H1B"
    group: String, // routing group, e.g. "H1B/H4"
    location: String, // consulate / city as read from the portal
    pageType: String, // "OFC" | "Consular"
    reason: String, // "location-changed" | "availability-changed"
    capturedBy: String, // name of the extension user/partner who reported it
    capturedByRole: { type: String, enum: ["admin", "partner", "user", "system"], default: "partner" },
    capturedByEmail: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    previousLocation: String,
    previousAvailability: String, // normalized text before the change
    currentAvailability: String, // normalized text after the change
    available: { type: Boolean, default: null }, // true / false / null(unknown)
    earliestDate: String,
    slots: String,
    totalDates: String,
    earliest: String,
    screenshotUrl: String, // base64 data URL (swap for hosted URL in production)
    screenshotNote: String, // why there's no screenshot, if applicable
    detectedAt: { type: Date, default: Date.now },
    source: { type: String, default: "extension" },
  },
  { timestamps: true }
);

eventSchema.index({ detectedAt: -1 });
eventSchema.index({ category: 1, location: 1, detectedAt: -1 });
eventSchema.index({ capturedByRole: 1, detectedAt: -1 });
eventSchema.index({ capturedByEmail: 1, detectedAt: -1 });

module.exports = mongoose.model("Event", eventSchema);
