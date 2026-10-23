import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SecureAuthStore } from "../src/main/secureAuthStore.js";

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value, "utf8").toString("base64"),
    decryptString: (value) =>
      Buffer.from(value.toString("utf8"), "base64").toString("utf8"),
  };
}

test("stores only encrypted authentication tokens and reads them back", async () => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), "ccp-auth-store-"));
  try {
    const store = new SecureAuthStore({
      safeStorage: fakeSafeStorage(),
      userDataPath,
    });
    const tokens = {
      accessToken: "access-token-value-long-enough",
      refreshToken: "refresh-token-value-long-enough",
    };

    await store.writeTokens(tokens);
    const encryptedContents = await readFile(path.join(userDataPath, "auth", "tokens.bin"));
    assert.equal(encryptedContents.includes(Buffer.from(tokens.accessToken)), false);
    assert.equal(encryptedContents.includes(Buffer.from(tokens.refreshToken)), false);
    assert.deepEqual(await store.readTokens(), tokens);
  } finally {
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test("rejects insecure credentials and unavailable platform encryption", async () => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), "ccp-auth-store-"));
  try {
    const store = new SecureAuthStore({
      safeStorage: fakeSafeStorage(),
      userDataPath,
    });
    await assert.rejects(
      store.writeTokens({
        accessToken: "access-token-value-long-enough",
        password: "not-allowed",
      }),
      /Only authentication tokens/,
    );

    const unavailable = new SecureAuthStore({
      safeStorage: {
        isEncryptionAvailable: () => false,
      },
      userDataPath,
    });
    await assert.rejects(
      unavailable.readTokens(),
      /Secure desktop credential storage is unavailable/,
    );
  } finally {
    await rm(userDataPath, { recursive: true, force: true });
  }
});
