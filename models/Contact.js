const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, default: "" },
    category: { type: String, default: "General" },
    preferredTime: { type: String, default: "Anytime" },
    targetCity: { type: String, default: "Any Center" },
    message: { type: String, default: "" },
    type: {
      type: String,
      enum: ["schedule-call", "general-contact"],
      default: "general-contact",
      index: true,
    },
    handled: { type: Boolean, default: false }, // admin can mark as dealt with
  },
  { timestamps: true }
);

contactSchema.index({ createdAt: -1 });
contactSchema.index({ type: 1, handled: 1 });

module.exports = mongoose.model("Contact", contactSchema);
