import { createHmac, timingSafeEqual } from "node:crypto";
import config from "../config/env.js";

function paymentError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeEqualHex(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    !/^[a-f\d]{64}$/i.test(left) ||
    !/^[a-f\d]{64}$/i.test(right)
  ) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && leftBuffer.length > 0 &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

export function toMinorUnitAmount(amountInput, currency) {
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency || "")) {
    throw paymentError("Payment amount or currency is invalid.", 400);
  }
  let fractionDigits;
  try {
    if (!Intl.supportedValuesOf("currency").includes(currency)) {
      throw new RangeError("Unknown currency.");
    }
    fractionDigits = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw paymentError("Payment currency is not supported.", 400);
  }
  const decimal = amount.toString().toLowerCase();
  const match = decimal.match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
  if (!match) throw paymentError("Payment amount is invalid.", 400);
  const fraction = match[2] || "";
  const decimalPosition = match[1].length + Number(match[3] || 0);
  const digits = `${match[1]}${fraction}`;
  const integerPart = decimalPosition <= 0
    ? "0"
    : decimalPosition >= digits.length
      ? digits.padEnd(decimalPosition, "0")
      : digits.slice(0, decimalPosition);
  const fractionalPart = decimalPosition <= 0
    ? `${"0".repeat(-decimalPosition)}${digits}`
    : decimalPosition >= digits.length
      ? ""
      : digits.slice(decimalPosition);
  if (/[1-9]/.test(fractionalPart.slice(fractionDigits))) {
    throw paymentError("Payment amount has more precision than the selected currency allows.", 400);
  }
  const minorAmount = BigInt(integerPart || "0") * (10n ** BigInt(fractionDigits)) +
    BigInt(fractionalPart.slice(0, fractionDigits).padEnd(fractionDigits, "0") || "0");
  if (minorAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw paymentError("Payment amount is too large.", 400);
  }
  return Number(minorAmount);
}

export function createRazorpayProvider({
  keyId,
  keySecret,
  webhookSecret,
  fetchImpl = globalThis.fetch,
}) {
  const isConfigured = Boolean(keyId && keySecret);

  async function request(path, { method = "GET", body } = {}) {
    if (!isConfigured) {
      throw paymentError("Razorpay is not configured on the server.", 503);
    }
    const authorization = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    let response;
    try {
      response = await fetchImpl(`https://api.razorpay.com/v1${path}`, {
        method,
        headers: {
          Authorization: `Basic ${authorization}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw paymentError("The payment service is temporarily unavailable.");
    }
    if (!response.ok) {
      throw paymentError("The payment service could not complete this request.");
    }
    return response.json();
  }

  return {
    getKeyId: () => keyId || "",
    async createOrder({ amount, currency, receipt }) {
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw paymentError("Payment amount must be a positive integer in the smallest currency unit.", 400);
      }
      return request("/orders", {
        method: "POST",
        body: { amount, currency, receipt, payment_capture: 1 },
      });
    },
    getPayment(paymentId) {
      return request(`/payments/${encodeURIComponent(paymentId)}`);
    },
    verifyPaymentSignature({ orderId, paymentId, signature }) {
      if (!isConfigured || !orderId || !paymentId || !signature) return false;
      const expected = createHmac("sha256", keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
      return safeEqualHex(expected, signature);
    },
    verifyWebhookSignature(rawBody, signature) {
      if (!webhookSecret || !Buffer.isBuffer(rawBody) || !signature) return false;
      const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      return safeEqualHex(expected, signature);
    },
  };
}

const provider = createRazorpayProvider({
  keyId: config.RAZORPAY_KEY_ID,
  keySecret: config.RAZORPAY_KEY_SECRET,
  webhookSecret: config.RAZORPAY_WEBHOOK_SECRET,
});

export const createRazorpayOrder = provider.createOrder;
export const getRazorpayPayment = provider.getPayment;
export const verifyRazorpayPaymentSignature = provider.verifyPaymentSignature;
export const verifyRazorpayWebhookSignature = provider.verifyWebhookSignature;
export const getRazorpayKeyId = provider.getKeyId;
