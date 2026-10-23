import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrganizationProfileName,
  normalizeOrganizationProfileName,
} from "../src/utils/organizationProfile.js";

test("normalizes saved organization names without changing their display spelling", () => {
  assert.equal(
    normalizeOrganizationProfileName("  CodeClash Labs  "),
    "CodeClash Labs",
  );
});

test("rejects missing, placeholder, oversized, and control-character organization names", () => {
  for (const value of [
    undefined,
    "",
    "Unspecified",
    "x".repeat(121),
    "Acme\u0000Labs",
  ]) {
    assert.equal(normalizeOrganizationProfileName(value), "");
  }
});

test("room membership reads the authenticated user's saved organization", () => {
  assert.equal(
    getOrganizationProfileName({ organization: "Saved Organization" }),
    "Saved Organization",
  );
  assert.equal(getOrganizationProfileName({ organization: "Unspecified" }), "");
});
