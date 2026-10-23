import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const TOKEN_KEYS = new Set(["accessToken", "refreshToken"]);
const MAX_TOKEN_LENGTH = 8_192;

function validateTokens(tokens) {
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
    throw new TypeError("Authentication tokens are invalid.");
  }
  for (const [key, value] of Object.entries(tokens)) {
    if (!TOKEN_KEYS.has(key)) {
      throw new TypeError("Only authentication tokens can be stored.");
    }
    if (
      value !== null &&
      (typeof value !== "string" ||
        value.length < 16 ||
        value.length > MAX_TOKEN_LENGTH)
    ) {
      throw new TypeError(`The ${key} value is invalid.`);
    }
  }
}

export class SecureAuthStore {
  constructor({ safeStorage, userDataPath }) {
    this.safeStorage = safeStorage;
    this.filePath = path.join(userDataPath, "auth", "tokens.bin");
    this.writeQueue = Promise.resolve();
  }

  async readTokens() {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure desktop credential storage is unavailable.");
    }
    try {
      const encrypted = await readFile(this.filePath);
      const parsed = JSON.parse(
        this.safeStorage.decryptString(encrypted),
      );
      validateTokens(parsed);
      return {
        accessToken: parsed.accessToken || null,
        refreshToken: parsed.refreshToken || null,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { accessToken: null, refreshToken: null };
      }
      throw new Error("Unable to read secure desktop credentials.");
    }
  }

  async writeTokens(tokens) {
    validateTokens(tokens);
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure desktop credential storage is unavailable.");
    }
    const writeOperation = this.writeQueue.then(async () => {
      const current = await this.readTokens();
      const next = {
        accessToken:
          tokens.accessToken === undefined ? current.accessToken : tokens.accessToken,
        refreshToken:
          tokens.refreshToken === undefined ? current.refreshToken : tokens.refreshToken,
      };
      const encrypted = this.safeStorage.encryptString(JSON.stringify(next));
      const directory = path.dirname(this.filePath);
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, encrypted, { mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    });
    this.writeQueue = writeOperation.catch(() => {});
    return writeOperation;
  }

  async clearTokens() {
    const clearOperation = this.writeQueue.then(() =>
      rm(this.filePath, { force: true }),
    );
    this.writeQueue = clearOperation.catch(() => {});
    return clearOperation;
  }
}
