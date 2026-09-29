const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: String, // optional
    rating: { type: Number, min: 1, max: 5 },
    message: { type: String, required: true },
    // Auto-published on submit. Admin can hide it or promote it to a success story.
    visible: { type: Boolean, default: true },
    isSuccessStory: { type: Boolean, default: false },
  },
  { timestamps: true }
);

feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
