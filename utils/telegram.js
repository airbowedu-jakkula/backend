const axios = require("axios");
const FormData = require("form-data");
const env = require("../config/env");

// Groups without their own channel (J1/J2, L1/L2, O1/O2, or anything unknown)
// fall back to the default channel.
function chatIdFor(group) {
  const id = env.telegram.channels[group] || env.telegram.defaultChannel;
  if (!id) throw new Error(`No Telegram channel configured for "${group}"`);
  return id;
}

async function sendTelegramPhoto(base64DataUrl, caption, group) {
  if (!env.telegram.botToken) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const chatId = chatIdFor(group);

  const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  const url = `https://api.telegram.org/bot${env.telegram.botToken}/sendPhoto`;

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append("caption", String(caption).slice(0, 1024));
      form.append("photo", buffer, { filename: "update.png", contentType: "image/png" });

      await axios.post(url, form, { headers: form.getHeaders(), timeout: 20000 });
      return;
    } catch (e) {
      lastError = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

async function sendTelegramMessage(text, group) {
  if (!env.telegram.botToken) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const chatId = chatIdFor(group);
  const url = `https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`;

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await axios.post(
        url,
        { chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true },
        { timeout: 20000 }
      );
      return;
    } catch (e) {
      lastError = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

module.exports = { sendTelegramPhoto, sendTelegramMessage };
