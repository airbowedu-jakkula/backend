const News = require("../models/News");

// Starter items so the landing-page "US non-immigrant visa updates" section is
// not empty on first launch. Only inserted when the collection is empty.
// The admin can edit or delete any of these from the dashboard.
const STARTER_NEWS = [
  {
    title: "Interview waiver (Dropbox) for visa renewals",
    summary:
      "Many applicants renewing a visa in the same classification can submit their documents without an in-person interview. Eligibility is shown in your account when you schedule.",
    category: "General",
    source: "travel.state.gov",
    url: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/interview-waiver.html",
  },
  {
    title: "Appointment wait times vary widely by consulate",
    summary:
      "Interview wait times differ a lot between posts and change week to week. Check the estimated wait for your city and watch this page for slots that open from cancellations.",
    category: "General",
    source: "travel.state.gov",
    url: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/wait-times.html",
  },
  {
    title: "Complete the DS-160 carefully before booking",
    summary:
      "You need a valid DS-160 confirmation barcode to schedule. Errors on the form are a common reason for delays — review every section, especially travel history and employment.",
    category: "General",
    source: "ceac.state.gov",
    url: "https://ceac.state.gov/genniv/",
  },
  {
    title: "B1/B2: be ready to show ties to your home country",
    summary:
      "Visitor visa applicants should carry evidence of strong ties — employment, property, family — and a clear purpose and itinerary for the trip.",
    category: "B1/B2",
  },
  {
    title: "F1/F2: apply early for the fall intake",
    summary:
      "Student visa demand peaks May–August. Pay the SEVIS I-901 fee, keep your I-20 and financial documents ready, and rebook to an earlier slot as soon as one appears.",
    category: "F1/F2",
    source: "fmjfee.com",
    url: "https://www.fmjfee.com/i901fee/index.html",
  },
  {
    title: "H1B/H4: keep petition documents on hand",
    summary:
      "Carry the I-797 approval notice, a copy of the I-129 petition, the Labor Condition Application and a current employment letter. H4 applicants also need the principal's H1B documents.",
    category: "H1B/H4",
  },
];

async function seedNews() {
  try {
    const count = await News.estimatedDocumentCount();
    if (count > 0) return;
    const now = Date.now();
    const docs = STARTER_NEWS.map((n, i) => ({
      ...n,
      // stagger publishedAt so they sort in listed order
      publishedAt: new Date(now - i * 60 * 60 * 1000),
    }));
    await News.insertMany(docs);
    console.log(`[seedNews] Inserted ${docs.length} starter news items`);
  } catch (err) {
    console.error("[seedNews] failed:", err.message);
  }
}

module.exports = { seedNews };
