// Public site groups everything into three buckets.
const CATEGORY_GROUPS = ["B1/B2", "F1/F2", "H1B/H4"];

// Category labels the monitoring extension offers.
const MONITOR_CATEGORIES = ["B1/B2", "H1B/H4", "F1/F2", "L1/L2", "J1/J2/O1/O2", "R1/R2"];

// Map a category label (grouped or granular) to the routing group used for the
// Telegram channel. Unknown -> null -> default channel.
const GRANULAR_TO_GROUP = {
  "B1/B2": "B1/B2",
  "B-1/B-2": "B1/B2",
  B1: "B1/B2",
  B2: "B1/B2",
  "B-1": "B1/B2",
  "B-2": "B1/B2",

  "F1/F2": "F1/F2",
  "F-1/F-2": "F1/F2",
  F1: "F1/F2",
  F2: "F1/F2",
  "F-1": "F1/F2",
  "F-2": "F1/F2",

  "H1B/H4": "H1B/H4",
  "H-1B/H-4": "H1B/H4",
  "H1B/H-4": "H1B/H4",
  H1B: "H1B/H4",
  "H-1B": "H1B/H4",
  H1B1: "H1B/H4",
  "H-1B1": "H1B/H4",
  H4: "H1B/H4",
  "H-4": "H1B/H4",

  "L1/L2": "L1/L2",
  "L-1/L-2": "L1/L2",
  L1: "L1/L2",
  L2: "L1/L2",
  "L-1": "L1/L2",
  "L-2": "L1/L2",

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
  const s = String(input).trim().toUpperCase();
  const stripped = s.replace(/[\s\-_/&]/g, "");

  // Regex & prefix checks matching standard consular portal formats
  if (
    stripped.startsWith("H1") ||
    stripped.startsWith("H4") ||
    stripped.includes("H1B") ||
    stripped.includes("H4") ||
    /^H[-_ ]*1/i.test(s) ||
    /^H[-_ ]*4/i.test(s)
  ) {
    return "H1B/H4";
  }
  if (
    stripped.startsWith("B1") ||
    stripped.startsWith("B2") ||
    stripped.includes("B1B2") ||
    /^B[-_ ]*1/i.test(s) ||
    /^B[-_ ]*2/i.test(s)
  ) {
    return "B1/B2";
  }
  if (
    stripped.startsWith("F1") ||
    stripped.startsWith("F2") ||
    stripped.includes("F1F2") ||
    /^F[-_ ]*1/i.test(s) ||
    /^F[-_ ]*2/i.test(s)
  ) {
    return "F1/F2";
  }
  if (
    stripped.startsWith("L1") ||
    stripped.startsWith("L2") ||
    stripped.includes("L1L2") ||
    /^L[-_ ]*1/i.test(s) ||
    /^L[-_ ]*2/i.test(s)
  ) {
    return "L1/L2";
  }

  for (const [k, v] of Object.entries(GRANULAR_TO_GROUP)) {
    if (k.toUpperCase().replace(/[\s\-_/&]/g, "") === stripped) return v;
  }

  return null;
}

module.exports = { CATEGORY_GROUPS, MONITOR_CATEGORIES, normalizeCategory };
