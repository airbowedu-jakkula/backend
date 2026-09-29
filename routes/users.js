const bcrypt = require("bcryptjs");
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { requireAdmin } = require("../middleware/auth");
const { str } = require("../middleware/validate");

// ADMIN: list all accounts (pending first, then approved).
router.get("/", requireAdmin, async (req, res) => {
  const users = await User.find()
    .select("email name role status createdAt lastActiveAt partnerNote assignedLocations")
    .sort({ status: 1, createdAt: -1 })
    .lean();
  res.json(users);
});

// ADMIN: create a new Partner account directly
router.post("/partner", requireAdmin, async (req, res) => {
  const name = str(req.body.name, 80) || "";
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const note = str(req.body.note, 200) || "";
  const autoApprove = req.body.autoApprove !== false; // default true for admin-created partners

  if (!email || password.length < 6) {
    return res.status(400).json({ error: "Email and a 6+ character password are required." });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(400).json({ error: "That email is already registered." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email,
    name,
    passwordHash,
    role: "partner",
    status: autoApprove ? "approved" : "pending",
    partnerNote: note,
  });

  res.status(201).json({
    ok: true,
    message: autoApprove ? "Partner created & verified successfully." : "Partner created with pending verification.",
    user: { id: user._id, email: user.email, name: user.name, role: user.role, status: user.status },
  });
});

// ADMIN: verify & approve a pending user/partner.
router.post("/:id/approve", requireAdmin, async (req, res) => {
  const u = await User.findByIdAndUpdate(
    req.params.id,
    { status: "approved" },
    { new: true }
  ).select("email name role status partnerNote lastActiveAt");
  if (!u) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true, message: `Verified and approved ${u.name || u.email}.`, user: u });
});

// ADMIN: reset password for a partner/user
router.put("/:id/reset-password", requireAdmin, async (req, res) => {
  const newPassword = String(req.body.password || "");
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long." });
  }

  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: "User not found" });

  u.passwordHash = await bcrypt.hash(newPassword, 10);
  await u.save();
  res.json({ ok: true, message: `Password reset successfully for ${u.name || u.email}.` });
});

// ADMIN: reject / revoke a user.
router.post("/:id/reject", requireAdmin, async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: "Not found" });
  if (u.role === "admin") return res.status(400).json({ error: "Cannot reject an admin" });
  u.status = "rejected";
  await u.save();
  res.json({ ok: true, message: `Access revoked for ${u.name || u.email}.` });
});

// ADMIN: delete a user.
router.delete("/:id", requireAdmin, async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: "Not found" });
  if (u.role === "admin") return res.status(400).json({ error: "Cannot delete an admin" });
  await u.deleteOne();
  res.json({ ok: true });
});

module.exports = router;
