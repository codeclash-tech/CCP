import { timingSafeEqual } from "node:crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import config from "../config/env.js";

const skipPreflight = (req) => req.method === "OPTIONS";

/**
 * Dedicated limiter for code execution endpoints (run/submit) to protect the
 * execution engine from abuse while still allowing legitimate rapid iterations.
 */
export const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPreflight,
  message: {
    error: "Too many code execution requests. Please wait a moment and retry.",
  },
});

/**
 * Limiter for room join attempts to prevent brute-forcing room keys.
 */
export const joinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPreflight,
  message: {
    error: "Too many join attempts. Please wait a moment and retry.",
  },
});

/**
 * Limiter for report / PDF generation (expensive, multi-query operations).
 */
export const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPreflight,
  message: {
    error: "Too many report requests. Please wait a moment and retry.",
  },
});

export const learningTutorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPreflight,
  message: {
    error: "Too many tutor messages. Please wait a moment and try again.",
  },
});

export const learningPurchaseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many purchase requests. Please try again later." },
  skip: skipPreflight,
});

export function requireJudgeCallbackSecret(req, res, next) {
  const configuredSecret = config.JUDGE_CALLBACK_SECRET;

  if (!configuredSecret) {
    return res.status(503).json({
      error: "Judge callback authentication is not configured.",
    });
  }

  const suppliedSecret = req.headers["x-judge-callback-key"];

  if (
    typeof suppliedSecret !== "string" ||
    Buffer.byteLength(suppliedSecret) !== Buffer.byteLength(configuredSecret) ||
    !timingSafeEqual(Buffer.from(suppliedSecret), Buffer.from(configuredSecret))
  ) {
    return res.status(401).json({
      error: "Invalid judge callback credentials.",
    });
  }

  next();
}

export function createCorsMiddleware(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    // Electron sends custom-scheme origins in mixed case (e.g.
    // COGNICLASH://app); compare case-insensitively so the desktop app is
    // never rejected over casing.
    const originMatch =
      origin &&
      allowedOrigins.find(
        (allowed) => allowed.toLowerCase() === origin.toLowerCase(),
      );

    if (origin && originMatch) {
      res.setHeader("Access-Control-Allow-Origin", originMatch);
    } else if (origin && !/^https?:/i.test(origin)) {
      // Custom desktop scheme origins (COGNICLASH://, codeclash:// and any
      // Electron fallback form) are always allowed so the packaged app is
      // never treated as a network failure.
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (!origin) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        allowedOrigins[0] || "https://COGNICLASH.amux.in",
      );
    }
    // Unknown http(s) origins (other websites) stay blocked: no ACAO header.
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      [
        "Content-Type",
        "Authorization",
        "X-Guest-ID",
        "X-Creator-Credential",
        "X-Judge-Callback-Key",
        "X-Request-Id",
        "X-CSRF-Token",
      ].join(", "),
    );
    res.setHeader("Access-Control-Expose-Headers", "X-Request-Id");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    next();
  };
}

export function securityMiddleware(app) {
  // Normalize CLIENT_URL so an accidental trailing slash does not
  // break exact CORS origin matching.
  const clientUrl = config.CLIENT_URL?.replace(/\/+$/, "");

  // COGNICLASH production frontend.
  // Keeping this explicit ensures the custom domain works even if
  // CLIENT_URL is temporarily missing or misconfigured.
  const productionFrontendUrl = "https://COGNICLASH.amux.in";
  // Hosted static website (Render). Render serves the site on an
  // onrender.com subdomain and any custom domain mapped to it; allow both
  // so the web app can authenticate and run against the same backend as
  // the desktop app.
  const hostedSiteOrigins = [
    "https://ccp-ce2f.onrender.com",
    "https://ccp-frontend.onrender.com",
  ];
  // Additional origins can be added without a code change: set
  // ADDITIONAL_CLIENT_ORIGINS in the backend environment as a
  // comma-separated list (e.g. "https://ccp-ce2f.onrender.com,https://ccp.amux.in").
  const additionalClientOrigins = (config.ADDITIONAL_CLIENT_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const desktopAppOrigin = "COGNICLASH://app";
  // Electron's fetch falls back to a conventional origin when a custom
  // scheme is not in its hard-coded allow list. Include the likely
  // fallback origins so desktop requests are not treated as cross-origin
  // failures by the renderer.
  const desktopFallbackOrigins = ["https://codeclash.app", "https://cogniclash.app"];

  // Helmet with strict CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],

          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "cdn.jsdelivr.net",
          ],

          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "cdn.jsdelivr.net",
            "fonts.googleapis.com",
          ],

          fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],

          imgSrc: ["'self'", "data:", "blob:"],

          connectSrc: [
            "'self'",
            clientUrl,
            productionFrontendUrl,
            ...hostedSiteOrigins,
            "https://code-executor.onrender.com",
          ].filter(Boolean),

          frameSrc: ["'none'"],

          objectSrc: ["'none'"],

          upgradeInsecureRequests: [],
        },
      },

      crossOriginEmbedderPolicy: false,

      crossOriginResourcePolicy: {
        policy: "cross-origin",
      },

      referrerPolicy: {
        policy: "strict-origin-when-cross-origin",
      },

      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // Rate limiting
  // Skip OPTIONS preflight requests (they carry no auth and browsers send them
  // before CORS requests). Counting them exhausts the limiter quickly.
  const generalLimiter = rateLimit({
    windowMs: parseInt(config.RATE_LIMIT_WINDOW_MS),
    max: parseInt(config.RATE_LIMIT_MAX),
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipPreflight,
    message: {
      error: "Too many requests, please try again later.",
    },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipPreflight,
    message: {
      error: "Too many authentication attempts. Please try again later.",
    },
  });

  const submissionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipPreflight,
    message: {
      error: "Too many submission attempts. Please slow down.",
    },
  });

  app.use("/api", generalLimiter);
  app.use("/api/auth", authLimiter);
  app.use("/api/submissions", submissionLimiter);

  // CORS hardening
  //
  // Production:
  //   https://COGNICLASH.amux.in
  //
  // CLIENT_URL is also retained so existing configured environments
  // continue to work.
  const allowedOrigins = [
    clientUrl,

    // Explicit production COGNICLASH domain.
    productionFrontendUrl,
    desktopAppOrigin,
    ...desktopFallbackOrigins,

    // Hosted static website origins (Render).
    ...hostedSiteOrigins,
    ...additionalClientOrigins,

    // Local development origins.
    ...(config.NODE_ENV === "production"
      ? []
      : ["http://localhost:5173", "http://localhost:3000"]),
  ].filter(Boolean);

  // Remove duplicates.
  const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

  app.use(createCorsMiddleware(uniqueAllowedOrigins));
}

// Input sanitization middleware
export function sanitizeInput(req, res, next) {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === "string") {
        // Strip null bytes and control characters
        req.body[key] = req.body[key].replace(
          /[\x00-\x08\x0B\x0C\x0E-\x1F]/g,
          "",
        );

        // Trim whitespace
        req.body[key] = req.body[key].trim();
      }
    }
  }

  next();
}

// Secure error handler
export function errorHandler(err, req, res, next) {
  const requestId = req.requestId || "unknown";

  console.error(`[Error][${requestId}]`, {
    message: err.message,
    stack: config.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  if (err.name === "ValidationError") {
    // Surface the individual failing paths so authors can fix the exact field.
    const fieldErrors = err.errors
      ? Object.entries(err.errors).map(([path, detail]) => ({
          field: path,
          message: detail?.message || String(detail),
        }))
      : [{ field: "_", message: err.message }];
    const summary = fieldErrors
      .map((e) => `${e.field}: ${e.message}`)
      .join(" | ");
    return res.status(400).json({
      error: `Validation failed (${summary})`,
      details: fieldErrors,
      requestId,
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      error: "Invalid ID format",
      requestId,
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      error: "Duplicate entry",
      requestId,
    });
  }

  if (err.name === "MulterError") {
    return res.status(400).json({
      error: "File upload error",
      details: err.message,
      requestId,
    });
  }

  const statusCode = err.statusCode || 500;

  const response = {
    error: statusCode === 500 ? "Internal server error" : err.message,
    requestId,
  };

  if (config.NODE_ENV === "development" && statusCode === 500) {
    response.details = err.message;
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
