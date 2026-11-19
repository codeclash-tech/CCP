import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createRazorpayProvider,
  toMinorUnitAmount,
} from "../src/services/razorpayService.js";

test("creates an order using server credentials and server-calculated amount", async () => {
  let captured;
  const provider = createRazorpayProvider({
    keyId: "public-test-key",
    keySecret: "private-test-secret",
    webhookSecret: "webhook-test-secret",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ id: "order_1", amount: 12500, currency: "INR" }) };
    },
  });
  const order = await provider.createOrder({ amount: 12500, currency: "INR", receipt: "purchase_1" });
  assert.equal(order.id, "order_1");
  assert.equal(captured.url, "https://api.razorpay.com/v1/orders");
  assert.equal(captured.options.headers.Authorization, `Basic ${Buffer.from("public-test-key:private-test-secret").toString("base64")}`);
  assert.deepEqual(JSON.parse(captured.options.body), {
    amount: 12500,
    currency: "INR",
    receipt: "purchase_1",
    payment_capture: 1,
  });
});

test("verifies checkout and webhook signatures using timing-safe HMAC comparisons", () => {
  const provider = createRazorpayProvider({
    keyId: "key",
    keySecret: "secret",
    webhookSecret: "webhook",
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  });
  const paymentSignature = createHmac("sha256", "secret")
    .update("order_1|pay_1")
    .digest("hex");
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const webhookSignature = createHmac("sha256", "webhook").update(rawBody).digest("hex");
  assert.equal(provider.verifyPaymentSignature({
    orderId: "order_1",
    paymentId: "pay_1",
    signature: paymentSignature,
  }), true);
  assert.equal(provider.verifyPaymentSignature({
    orderId: "order_2",
    paymentId: "pay_1",
    signature: paymentSignature,
  }), false);
  assert.equal(provider.verifyWebhookSignature(rawBody, webhookSignature), true);
  assert.equal(provider.verifyWebhookSignature(rawBody, `${webhookSignature}00`), false);
});

test("reports provider outages and rejects malformed order amounts", async () => {
  const unavailable = createRazorpayProvider({
    keyId: "key",
    keySecret: "secret",
    webhookSecret: "webhook",
    fetchImpl: async () => { throw new Error("network down"); },
  });

  test("converts module prices using ISO currency precision without rounding excess decimals", () => {
    assert.equal(toMinorUnitAmount(125.5, "INR"), 12550);
    assert.equal(toMinorUnitAmount(125, "JPY"), 125);
    assert.equal(toMinorUnitAmount(1.005, "KWD"), 1005);
    assert.throws(() => toMinorUnitAmount(1.001, "INR"), /more precision/);
    assert.throws(() => toMinorUnitAmount(10, "ZZZ"), /not supported/);
  });
  await assert.rejects(
    unavailable.createOrder({ amount: 100, currency: "INR", receipt: "purchase_1" }),
    /temporarily unavailable/,
  );
  await assert.rejects(
    unavailable.createOrder({ amount: 0, currency: "INR", receipt: "purchase_1" }),
    /positive integer/,
  );
});
