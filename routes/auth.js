const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const User = require("../models/User");
const env = require("../config/env");
const { requireApproved } = require("../middleware/auth");
const { loginLimiter, publicWriteLimiter } = require("../middleware/rateLimit");
const { str } = require("../middleware/validate");

function sign(user) {
  return jwt.sign({ id: user._id, role: user.role }, env.jwtSecret, { expiresIn: "7d" });
}

// Partner self-registration → creates a PENDING partner account.
// Requires Admin to verify and approve for the first time before login is permitted.
router.post("/register", publicWriteLimiter, async (req, res) => {
  const name = str(req.body.name, 80) || "";
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const note = str(req.body.note, 200) || "";
  if (!email || password.length < 6) {
    return res.status(400).json({ error: "Email and a 6+ character password are required" });
  }
  if (await User.findOne({ email })) {
    return res.status(400).json({ error: "That email is already registered" });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({ email, name, passwordHash, role: "partner", status: "pending", partnerNote: note });
  res.status(201).json({
    ok: true,
    message: "Partner account registered. Please wait for Admin to verify and approve your account before signing in.",
  });
});

// Login — works for admin and approved partners. Returns token, role, and details.
router.post("/login", loginLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(400).json({ error: "Invalid credentials" });

  if (user.role !== "admin" && user.status !== "approved") {
    return res.status(403).json({
      error:
        user.status === "rejected"
          ? "Your partner account was rejected. Contact the administrator."
          : "Your partner account is pending verification and approval by the Admin.",
      status: user.status,
    });
  }

  // Update last active
  user.lastActiveAt = new Date();
  await user.save();

  res.json({
    token: sign(user),
    user: { id: user._id, email: user.email, name: user.name, role: user.role, status: user.status },
  });
});

// Confirm the token is still valid; returns the live role/status.
router.get("/me", requireApproved, async (req, res) => {
  res.json({ user: req.user });
});

// Change Password for currently authenticated user (Admin or Partner)
router.post("/change-password", requireApproved, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters long." });
  }

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (currentPassword) {
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(400).json({ error: "Incorrect current password" });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.json({ ok: true, message: "Password updated successfully." });
});

// Update Admin Credentials / Profile (Admin only)
router.post("/admin-profile", requireApproved, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: "Admin account not found" });

  const newEmail = String(req.body.email || "").trim().toLowerCase();
  const newName = str(req.body.name, 80);
  const newPassword = String(req.body.password || "");

  if (newEmail && newEmail !== user.email) {
    const conflict = await User.findOne({ email: newEmail, _id: { $ne: user._id } });
    if (conflict) return res.status(400).json({ error: "That email is already in use" });
    user.email = newEmail;
  }

  if (newName) user.name = newName;
  if (newPassword && newPassword.length >= 6) {
    user.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await user.save();
  res.json({
    ok: true,
    message: "Admin credentials updated successfully.",
    user: { id: user._id, email: user.email, name: user.name, role: user.role },
  });
});

module.exports = router;
