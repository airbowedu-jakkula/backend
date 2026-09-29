const bcrypt = require("bcryptjs");
const User = require("../models/User");
const env = require("../config/env");

// Ensures exactly one admin account exists, matching ADMIN_EMAIL / ADMIN_PASSWORD
// from the environment. Runs on every server start; updates the password hash if
// ADMIN_PASSWORD changed.
async function seedAdmin() {
  const email = (env.adminEmail || "").toLowerCase();
  const password = env.adminPassword;

  if (!email || !password) {
    console.warn("[seedAdmin] ADMIN_EMAIL / ADMIN_PASSWORD not set — no admin account.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ email });

  if (!existing) {
    await User.create({ email, passwordHash, name: "Admin", role: "admin", status: "approved" });
    console.log(`[seedAdmin] created admin account for ${email}`);
    return;
  }

  existing.role = "admin";
  existing.status = "approved";
  const matches = await bcrypt.compare(password, existing.passwordHash);
  if (!matches) existing.passwordHash = passwordHash;
  await existing.save();
}

module.exports = { seedAdmin };
