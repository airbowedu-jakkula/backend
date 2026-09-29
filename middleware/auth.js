const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/User");

function readToken(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// Any signed-in ADMIN.
function requireAdmin(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = payload;
    if (payload.role !== "admin") return res.status(403).json({ error: "Admin only" });
    next();
  } catch {
    return res.status(401).json({ error: "Session expired, sign in again" });
  }
}

// Any signed-in, APPROVED account (admin or user). Re-checks status in the DB
// so a revoked user is locked out immediately.
async function requireApproved(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.id).select("role status name email");
    if (!user) return res.status(401).json({ error: "Account not found" });
    if (user.role !== "admin" && user.status !== "approved") {
      return res.status(403).json({ error: "Account not approved" });
    }
    req.user = { id: String(user._id), role: user.role, status: user.status, name: user.name };
    next();
  } catch {
    return res.status(401).json({ error: "Session expired, sign in again" });
  }
}

// Accepts a valid admin JWT OR the shared extension API key.
function requireAdminOrExtensionKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (key && env.extensionApiKey && key === env.extensionApiKey) {
    req.viaExtension = true;
    return next();
  }
  return requireAdmin(req, res, next);
}

// Accepts the shared extension API key OR any approved user/admin JWT.
async function requireExtensionUser(req, res, next) {
  const key = req.headers["x-api-key"];
  if (key && env.extensionApiKey && key === env.extensionApiKey) {
    req.viaExtension = true;
    return next();
  }
  return requireApproved(req, res, next);
}

module.exports = {
  requireAdmin,
  requireApproved,
  requireAdminOrExtensionKey,
  requireExtensionUser,
};
