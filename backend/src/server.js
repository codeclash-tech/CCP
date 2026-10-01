import express from "express";
import morgan from "morgan";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectDB, getConnectionStatus } from "./config/db.js";
import config from "./config/env.js";
import { startCleanupJobs } from "./services/cleanupJob.js";
import {
  securityMiddleware,
  sanitizeInput,
  errorHandler,
} from "./middleware/security.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import authRoutes from "./routes/authRoutes.js";
import challengeRoutes from "./routes/challengeRoutes.js";
import executeRoutes from "./routes/executeRoutes.js";
import submissionRoutes from "./routes/submissionRoutes.js";
import leaderboardRoutes from "./routes/leaderboardRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import battleRoomRoutes from "./routes/battleRoomRoutes.js";
import creatorVerificationRoutes from "./routes/creatorVerificationRoutes.js";

const app = express();
app.set("trust proxy", 1);
const PORT = config.PORT || 5000;

// Request ID middleware - must be first
app.use(requestIdMiddleware);

// Request logging
app.use(morgan(config.LOG_LEVEL || "dev"));

// Security middleware (Helmet, CORS, Rate Limiting)
securityMiddleware(app);

// Body parsing with size limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Input sanitization
app.use(sanitizeInput);

// Health check (no auth required)
app.get("/api/health", (req, res) => {
  const databaseReady = getConnectionStatus();
  const status = databaseReady ? "healthy" : "degraded";
  res.status(databaseReady ? 200 : 503).json({
    status,
    dependencies: { database: databaseReady ? "connected" : "disconnected" },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    requestId: req.requestId,
    version: "2.0.0",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/challenges", challengeRoutes);
app.use("/api/execute", executeRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/battle-rooms", battleRoomRoutes);
app.use("/api/creator-verification", creatorVerificationRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.path,
    requestId: req.requestId,
  });
});

// Error handler (must be last)
app.use(errorHandler);

export async function start() {
  const dbConnected = await connectDB();
  if (!dbConnected) {
    throw new Error(
      "Database connection is required before the API can start.",
    );
  }
  startCleanupJobs();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Environment: ${config.NODE_ENV}`);
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

export default app;
