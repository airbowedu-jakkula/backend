/**
 * Prints every chat/channel the bot can currently see.
 *
 *   node scripts/getBotIds.js
 *
 * How Telegram works here:
 *  - A bot only receives updates for a channel/group AFTER it is added there
 *    (as an admin for channels).
 *  - getUpdates only returns events from the last ~24h that have NOT already
 *    been consumed, and returns NOTHING while a webhook is set.
 *
 * So the flow is:
 *  1. Add the bot to the channel as an admin.
 *  2. Post any message in that channel (or rename it / change its photo).
 *  3. Run this script within 24h.
 */
require("dotenv").config();
const axios = require("axios");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not set in backend/.env");
  process.exit(1);
}

const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function main() {
  // 1. Who am I?
  const me = await axios.get(api("getMe")).then((r) => r.data.result);
  console.log(`Bot: @${me.username} (id ${me.id})\n`);

  // 2. A webhook silently swallows getUpdates — check and clear it.
  const hook = await axios.get(api("getWebhookInfo")).then((r) => r.data.result);
  if (hook.url) {
    console.log(`A webhook is set (${hook.url}). Deleting it so getUpdates works...`);
    await axios.get(api("deleteWebhook"));
  }

  // 3. Pull updates.
  const updates = await axios
    .get(api("getUpdates"), { params: { timeout: 0, allowed_updates: JSON.stringify([]) } })
    .then((r) => r.data.result);

  if (!updates.length) {
    console.log("No updates.\n");
    console.log("Do this, then re-run:");
    console.log(" - Add @" + me.username + " to the channel as an ADMIN");
    console.log(" - Post a message in the channel (or a group the bot is in)");
    console.log(" - For a private chat: open the bot in Telegram and send it /start");
    return;
  }

  const chats = new Map();
  for (const u of updates) {
    const chat =
      (u.message && u.message.chat) ||
      (u.channel_post && u.channel_post.chat) ||
      (u.edited_channel_post && u.edited_channel_post.chat) ||
      (u.my_chat_member && u.my_chat_member.chat) ||
      (u.chat_member && u.chat_member.chat);
    if (chat) chats.set(chat.id, chat);
  }

  if (!chats.size) {
    console.log("Got updates but none carried a chat. Raw dump:\n");
    console.log(JSON.stringify(updates, null, 2));
    return;
  }

  console.log("Chats the bot can see:\n");
  for (const chat of chats.values()) {
    const name = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username;
    console.log(`  ${chat.id}   ${chat.type.padEnd(10)} ${name}`);
  }
  console.log("\nPut the channel id (starts with -100) into the matching");
  console.log("TELEGRAM_CHAT_ID_* line in backend/.env");
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
