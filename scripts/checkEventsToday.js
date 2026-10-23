const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const Event = require("../models/Event");
const WhatsAppJob = require("../models/WhatsAppJob");

async function check() {
  const uri = process.env.MONGO_URI || "mongodb+srv://jvnpraveen22_db_user:RijBZXw3LwdkrUMQ@cluster0.tmhhpxm.mongodb.net/visaslots";
  await mongoose.connect(uri);
  console.log("Connected to DB");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const events = await Event.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20).lean();
  console.log(`\nEvents in last 24h (${events.length}):`);
  for (const e of events) {
    console.log(` - ${e.createdAt.toISOString()} | Cat: ${e.category} | Group: ${e.group} | Loc: ${e.location} | Avail: ${e.available} | Date: ${e.earliestDate} | Slots: ${e.slots}`);
  }

  const jobs = await WhatsAppJob.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20).lean();
  console.log(`\nWhatsApp Jobs in last 24h (${jobs.length}):`);
  for (const j of jobs) {
    console.log(` - ${j.createdAt.toISOString()} | Group: ${j.group} | Loc: ${j.location} | Status: ${j.status} | ScheduledAt: ${j.scheduledAt ? j.scheduledAt.toISOString() : 'N/A'} | Attempts: ${j.attempts} | DedupeKey: ${j.dedupeKey}`);
  }

  await mongoose.disconnect();
}
check().catch(console.error);
