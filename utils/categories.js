// Public site groups everything into three buckets.
const CATEGORY_GROUPS = ["B1/B2", "F1/F2", "H1B/H4"];

// Category labels the monitoring extension offers.
const MONITOR_CATEGORIES = ["B1/B2", "H1B/H4", "F1/F2", "L1/L2", "J1/J2/O1/O2", "R1/R2"];

// Map a category label (grouped or granular) to the routing group used for the
// Telegram channel. Unknown -> null -> default channel.
const GRANULAR_TO_GROUP = {
  "B1/B2": "B1/B2",
  B1: "B1/B2",
  B2: "B1/B2",

  "F1/F2": "F1/F2",
  F1: "F1/F2",
  F2: "F1/F2",

  "H1B/H4": "H1B/H4",
  H1B: "H1B/H4",
  H1B1: "H1B/H4",
  H4: "H1B/H4",

  "L1/L2": "L1/L2",
  L1: "L1/L2",
  L2: "L1/L2",

  "J1/J2/O1/O2": "J1/J2/O1/O2",
  "J1/J2": "J1/J2/O1/O2",
  "O1/O2": "J1/J2/O1/O2",
  J1: "J1/J2/O1/O2",
  J2: "J1/J2/O1/O2",
  O1: "J1/J2/O1/O2",
  O2: "J1/J2/O1/O2",

  "R1/R2": "R1/R2",
  R1: "R1/R2",
  R2: "R1/R2",
};

function normalizeCategory(input) {
  if (!input) return null;
  const key = String(input).trim().toUpperCase().replace(/\s+/g, "");
  for (const [k, v] of Object.entries(GRANULAR_TO_GROUP)) {
    if (k.toUpperCase().replace(/\s+/g, "") === key) return v;
  }
  return null;
}

module.exports = { CATEGORY_GROUPS, MONITOR_CATEGORIES, normalizeCategory };
