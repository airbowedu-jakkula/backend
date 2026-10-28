const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function optional(name, fallback = "") {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

const env = {
  nodeEnv: optional("NODE_ENV", "production"),
  port: parseInt(optional("PORT", "5000"), 10),

  mongoUri: optional("MONGO_URI"),
  jwtSecret: optional("JWT_SECRET", "visa-alerts-jwt-secret-key-2026"),

  adminEmail: optional("ADMIN_EMAIL"),
  adminPassword: optional("ADMIN_PASSWORD"),
  adminWhatsApp: optional("ADMIN_WHATSAPP", "918143852523@c.us"),
  extensionApiKey: optional("EXTENSION_API_KEY"),

  // comma-separated list of allowed browser origins; "*" allows any
  allowedOrigins: optional("ALLOWED_ORIGINS", "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  telegram: {
    botToken: optional("TELEGRAM_BOT_TOKEN"),
    channels: {
      "B1/B2": optional("TELEGRAM_CHAT_ID_B1B2", "-1004398301305"),
      "F1/F2": optional("TELEGRAM_CHAT_ID_F1F2", "-1004455830105"),
      "H1B/H4": optional("TELEGRAM_CHAT_ID_H1BH4", "-1004442030672"),
    },
    defaultChannel: optional("TELEGRAM_CHAT_ID_DEFAULT", "-1004442030672"),
  },

  alertDelayMinutes: parseInt(optional("ALERT_DELAY_MINUTES", "10"), 10),
  whatsapp: {
    // Set in backend/.env or Render environment variables; never put in the extension.
    publisherToken: optional("WHATSAPP_PUBLISHER_TOKEN"),
    backendUrl: optional("BACKEND_URL", "http://localhost:5000"),
    groups: {
      "B1/B2": optional("WHATSAPP_GROUP_B1B2", "120363409650684618@g.us"),
      "F1/F2": optional("WHATSAPP_GROUP_F1F2", "120363433828045224@g.us"),
      "H1B/H4": optional("WHATSAPP_GROUP_H1BH4", "120363410431386086@g.us"),
    },
  },
  geminiApiKey: optional("GEMINI_API_KEY"),
};

env.isProd = env.nodeEnv === "production";

// Informational warnings at startup
if (!env.mongoUri) {
  console.warn("[config] MONGO_URI not set — database connection will wait for configuration.");
}
if (!env.adminEmail || !env.adminPassword) {
  console.warn("[config] ADMIN_EMAIL / ADMIN_PASSWORD not set — dashboard login disabled.");
}
if (!env.extensionApiKey) {
  console.warn("[config] EXTENSION_API_KEY not set — extension events will require admin auth.");
}
if (!env.telegram.botToken) {
  console.warn("[config] TELEGRAM_BOT_TOKEN not set — Telegram alerts disabled.");
}
if (env.isProd && env.allowedOrigins.includes("*")) {
  console.warn("[config] ALLOWED_ORIGINS is '*' in production.");
}

module.exports = env;
