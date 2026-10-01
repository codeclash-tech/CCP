import dotenv from "dotenv";

dotenv.config();

const requiredVars = ["MONGODB_URI", "JWT_SECRET", "JWT_REFRESH_SECRET"];

const optionalVars = {
  PORT: "5000",
  NODE_ENV: "development",
  CLIENT_URL: "http://localhost:5173",
  API_PUBLIC_URL: "",
  BREVO_API_KEY: "",
  SECURE_CODE_ENGINE_URL:
    "https://secure-code-engine.onrender.com/api/v1/execute",
  SECURE_CODE_ENGINE_TIMEOUT_MS: "120000",
  RATE_LIMIT_WINDOW_MS: "900000",
  RATE_LIMIT_MAX: "300",
  OTP_EXPIRY_MINUTES: "5",
  OTP_TTL_SECONDS: "300",
  OTP_MAX_ATTEMPTS: "3",
  OTP_RESEND_COOLDOWN_SECONDS: "30",
  JUDGE_CALLBACK_SECRET: "",
  JWT_EXPIRY: "15m",
  JWT_REFRESH_EXPIRY: "7d",
  JWT_ISSUER: "amux-ccp",
  LOG_LEVEL: process.env.NODE_ENV === "production" ? "combined" : "dev",
  SUPER_ADMIN_EMAIL: "helloamux@gmail.com",
};

function validateEnv() {
  const missing = [];
  for (const key of requiredVars) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(
      `[Config] Missing required environment variables: ${missing.join(", ")}`,
    );
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    } else {
      console.warn("[Config] Running in development mode with default values.");
    }
  }

  const config = { ...process.env };
  // Strip trailing semicolons / whitespace from all config values. Semicolons
  // are frequently appended accidentally in .env files (e.g. "587;" or
  // "development;") and break numeric/boolean parsing downstream.
  for (const key of Object.keys(config)) {
    if (typeof config[key] === "string") {
      config[key] = config[key].replace(/;\s*$/, "").trim();
    }
  }
  for (const [key, defaultValue] of Object.entries(optionalVars)) {
    if (!config[key]) {
      config[key] = defaultValue;
    }
  }

  if (config.NODE_ENV === "production") {
    const productionErrors = [];
    for (const key of ["JWT_SECRET", "JWT_REFRESH_SECRET"]) {
      if (typeof config[key] !== "string" || config[key].length < 32) {
        productionErrors.push(`${key} must contain at least 32 characters`);
      }
    }
    if (config.JWT_SECRET === config.JWT_REFRESH_SECRET) {
      productionErrors.push("JWT_SECRET and JWT_REFRESH_SECRET must be different");
    }
    if (!process.env.CLIENT_URL || !/^https:\/\//i.test(config.CLIENT_URL)) {
      productionErrors.push("CLIENT_URL must be set to the HTTPS frontend origin");
    }
    if (!config.BREVO_API_KEY) {
      productionErrors.push("BREVO_API_KEY must be configured");
    }
    if (productionErrors.length > 0) {
      console.error(
        `[Config] Invalid production configuration: ${productionErrors.join("; ")}`,
      );
      process.exit(1);
    }
  }

  return config;
}

const config = validateEnv();

export default config;
