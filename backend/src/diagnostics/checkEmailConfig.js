import "dotenv/config";

console.log("=== EMAIL CONFIG DIAGNOSTIC ===");
console.log("RESEND_API_KEY =", process.env.RESEND_API_KEY ? "(set / non-empty)" : "(empty)");
console.log("NODE_ENV =", process.env.NODE_ENV || "development");
console.log("================================");
