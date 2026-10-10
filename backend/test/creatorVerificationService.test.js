import assert from "node:assert/strict";
import test from "node:test";
import { createCreatorVerificationService } from "../src/services/creatorVerificationService.js";

function createVerificationFixture() {
  const records = new Map();
  let currentTime = new Date("2026-01-01T00:00:00.000Z");
  const repository = {
    async findByEmail(email) {
      return records.get(email) || null;
    },
    async replace(email, data) {
      const record = { _id: "otp-id", email, ...data };
      records.set(email, record);
      return record;
    },
    async incrementAttempts(id) {
      const record = [...records.values()].find((item) => item._id === id);
      if (record) record.attempts += 1;
    },
    async consume(record) {
      records.delete(record.email);
      return record;
    },
  };
  const service = createCreatorVerificationService({
    repository,
    secret: "verification-test-secret",
    sendOtp: async () => {},
    findOrCreateVerifiedUser: async (email) => ({
      _id: { toString: () => "user-id" },
      email,
      organization: "Unspecified",
      role: "USER",
    }),
    createLoginToken: () => "login-token",
    ttlSeconds: 60,
    maxAttempts: 3,
    cooldownSeconds: 1,
    now: () => new Date(currentTime),
    createCode: () => "012345",
  });

  return {
    service,
    records,
    advanceTime(milliseconds) {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

test("rejects incorrect creator OTPs and increments the attempt count", async () => {
  const { service, records } = createVerificationFixture();
  await service.requestOtp("person@example.com");

  await assert.rejects(
    service.verifyOtp("person@example.com", "999999"),
    (error) => error.status === 400,
  );
  assert.equal(records.get("person@example.com").attempts, 1);
});

test("rejects an expired creator OTP without consuming another attempt", async () => {
  const { service, records, advanceTime } = createVerificationFixture();
  await service.requestOtp("person@example.com");
  advanceTime(60_000);

  await assert.rejects(
    service.verifyOtp("person@example.com", "012345"),
    (error) => error.status === 400,
  );
  assert.equal(records.get("person@example.com").attempts, 0);
});

test("accepts a valid creator OTP and consumes it once", async () => {
  const { service, records } = createVerificationFixture();
  await service.requestOtp("person@example.com");

  const result = await service.verifyOtp("person@example.com", "012345");

  assert.equal(result.token, "login-token");
  assert.equal(result.email, "person@example.com");
  assert.equal(records.has("person@example.com"), false);
});
