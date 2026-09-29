// Small input helpers — trim, cap length, coerce.

function str(value, maxLen = 500) {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  return s.slice(0, maxLen);
}

function required(res, obj) {
  // obj: { fieldName: value }  -> returns false + sends 400 if any is empty
  const missing = Object.entries(obj)
    .filter(([, v]) => v == null || String(v).trim() === "")
    .map(([k]) => k);
  if (missing.length) {
    res.status(400).json({ error: `Missing required field(s): ${missing.join(", ")}` });
    return false;
  }
  return true;
}

function intInRange(value, def, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

// 404 for unknown API routes
function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// Central error handler — keeps stack traces out of client responses.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Payload too large (screenshot over the size limit)" });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: "Invalid id" });
  }
  res.status(500).json({ error: "Server error" });
}

module.exports = { str, required, intInRange, notFound, errorHandler };
