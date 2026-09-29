const rateLimit = require("express-rate-limit");

const json = { error: "Too many requests — please slow down and try again shortly." };

// Broad ceiling for the whole API.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: json,
});

// Tighter limit for unauthenticated public form submissions.
const publicWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: json,
});

// Login: slow down brute force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: json,
});

// Extension events/heartbeats: allow frequent posts, still bounded.
const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: json,
});

module.exports = { apiLimiter, publicWriteLimiter, loginLimiter, eventLimiter };
