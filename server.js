
require("express-async-errors");

const env = require("./config/env");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const updateRoutes = require("./routes/updates");
const contactRoutes = require("./routes/contacts");
const feedbackRoutes = require("./routes/feedback");
const newsRoutes = require("./routes/news");
const eventRoutes = require("./routes/events");
const whatsappQueueRoutes = require("./routes/whatsappQueue");

const { seedAdmin } = require("./utils/seedAdmin");
const { seedNews } = require("./utils/seedNews");
const { apiLimiter } = require("./middleware/rateLimit");
const { notFound, errorHandler } = require("./middleware/validate");

const app = express();

app.set("trust proxy", 1);

// --------------------------------------------------
// CORS CONFIGURATION
// --------------------------------------------------

const extensionOrigin =
  "chrome-extension://kiefpmoefiamkccngakfkjeabojkljgg";

const configuredOrigins = Array.isArray(env.allowedOrigins)
  ? env.allowedOrigins
  : [];

const allowedOrigins = [
  ...configuredOrigins,
  extensionOrigin,
];

const allowAllOrigins = allowedOrigins.includes("*");

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header.
      if (!origin) {
        return callback(null, true);
      }

      // Preserve wildcard behavior if configured.
      if (allowAllOrigins) {
        return callback(null, true);
      }

      // Allow configured websites and the Chrome extension.
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`[CORS] Blocked origin: ${origin}`);

      return callback(new Error(`CORS blocked origin: ${origin}`));
    },

    methods: [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],

    optionsSuccessStatus: 204,
  })
);

// --------------------------------------------------
// SECURITY AND REQUEST MIDDLEWARE
// --------------------------------------------------

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: "12mb" }));

app.use(morgan(env.isProd ? "combined" : "dev"));

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  const states = [
    "disconnected",
    "connected",
    "connecting",
    "disconnecting",
  ];

  res.json({
    ok: true,
    db: states[mongoose.connection.readyState] || "unknown",
    env: env.nodeEnv,
  });
});

// --------------------------------------------------
// API ROUTES
// CORS middleware must remain above these routes.
// --------------------------------------------------

app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/updates", updateRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/whatsapp-queue", whatsappQueueRoutes);

// --------------------------------------------------
// NOT FOUND AND ERROR HANDLING
// --------------------------------------------------

app.use("/api", notFound);
app.use(errorHandler);

// --------------------------------------------------
// DATABASE CONNECTION AND SERVER STARTUP
// --------------------------------------------------

let server;

mongoose
  .connect(env.mongoUri)
  .then(async () => {
    console.log("[db] MongoDB connected");

    await seedAdmin();
    await seedNews();

    server = app.listen(env.port, () => {
      console.log(`[http] listening on port ${env.port}`);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `[http] port ${env.port} is already in use. ` +
          "Stop the other server or change PORT in .env."
        );
      } else {
        console.error("[http]", err.message);
      }

      process.exit(1);
    });
  })
  .catch((err) => {
    console.error("[db] connection failed:", err.message);
    process.exit(1);
  });

// --------------------------------------------------
// GRACEFUL SHUTDOWN
// --------------------------------------------------

function shutdown(signal) {
  console.log(`\n[${signal}] shutting down...`);

  if (server) {
    server.close(() => {
      console.log("[http] closed");
    });
  }

  mongoose.connection
    .close(false)
    .then(() => {
      console.log("[db] closed");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[db] shutdown error:", err.message);
      process.exit(1);
    });
}

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
