require("dotenv").config();

// Validate and normalise environment configuration once, at startup.
function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`\n[config] Missing required environment variable: ${name}`);
    console.error("[config] Copy backend/.env.example to backend/.env and fill it in.\n");
    process.exit(1);
  }
  return v.trim();
}

function optional(name, fallback = "") {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: parseInt(optional("PORT", "5000"), 10),

  mongoUri: required("MONGO_URI"),
  jwtSecret: required("JWT_SECRET"),

  adminEmail: optional("ADMIN_EMAIL"),
  adminPassword: optional("ADMIN_PASSWORD"),
  extensionApiKey: optional("EXTENSION_API_KEY"),

  // comma-separated list of allowed browser origins; "*" allows any
  allowedOrigins: optional("ALLOWED_ORIGINS", "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  telegram: {
    botToken: optional("TELEGRAM_BOT_TOKEN"),
    channels: {
      "B1/B2": optional("TELEGRAM_CHAT_ID_B1B2"),
      "F1/F2": optional("TELEGRAM_CHAT_ID_F1F2"),
      "H1B/H4": optional("TELEGRAM_CHAT_ID_H1BH4"),
    },
    defaultChannel: optional("TELEGRAM_CHAT_ID_DEFAULT"),
  },

  alertDelayMinutes: parseInt(optional("ALERT_DELAY_MINUTES", "10"), 10),
  geminiApiKey: optional("GEMINI_API_KEY"),
};

env.isProd = env.nodeEnv === "production";

// Warn (don't crash) about things that only disable a feature.
if (!env.adminEmail || !env.adminPassword) {
  console.warn("[config] ADMIN_EMAIL / ADMIN_PASSWORD not set — no admin account, dashboard login disabled.");
}
if (!env.extensionApiKey) {
  console.warn("[config] EXTENSION_API_KEY not set — the browser extension cannot post events.");
}
if (!env.telegram.botToken) {
  console.warn("[config] TELEGRAM_BOT_TOKEN not set — Telegram alerts disabled.");
}
if (env.isProd && env.allowedOrigins.includes("*")) {
  console.warn("[config] ALLOWED_ORIGINS is '*' in production — set it to your website's domain.");
}

module.exports = env;
