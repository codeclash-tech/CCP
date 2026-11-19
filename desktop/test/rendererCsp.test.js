import assert from "node:assert/strict";
import test from "node:test";
import { allowRazorpayCheckoutInDesktopRenderer } from "../src/main/rendererCsp.js";

test("enables Razorpay only in the packaged desktop renderer policy", () => {
  const html = '<meta content="script-src \'self\'; frame-src \'none\'; form-action \'self\'">';
  const updated = allowRazorpayCheckoutInDesktopRenderer(html);

  assert.match(updated, /script-src 'self' https:\/\/checkout\.razorpay\.com/);
  assert.match(updated, /frame-src https:\/\/api\.razorpay\.com https:\/\/checkout\.razorpay\.com/);
  assert.match(updated, /form-action 'self' https:\/\/api\.razorpay\.com/);
});
