const mongoose = require("mongoose");

// The seeded admin (from env) plus extension users who self-register and are
// approved by the admin.
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: "" },
    role: { type: String, enum: ["admin", "partner", "user"], default: "partner" },
    // Partner & user accounts start "pending" and must be verified & approved by Admin
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    partnerNote: { type: String, default: "" },
    assignedLocations: [{ type: String }],
    lastActiveAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

