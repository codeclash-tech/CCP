import assert from "node:assert/strict";
import test from "node:test";
import { getAssessmentRole } from "../src/models/User.js";
import { initializeSuperAdmin } from "../src/services/superAdminBootstrapService.js";

test("derives Super Admin exclusively from the persisted admin role", () => {
  assert.equal(getAssessmentRole({ role: "ADMIN", creatorType: "INDIVIDUAL" }), "SUPER_ADMIN");
  assert.equal(getAssessmentRole({ role: "USER", email: "admin@example.com" }), "CANDIDATE");
});

test("distinguishes organization creators from candidates", () => {
  assert.equal(
    getAssessmentRole({ role: "USER", creatorType: "ORGANIZATION" }),
    "ORGANIZATION_USER",
  );
  assert.equal(
    getAssessmentRole({ role: "USER", creatorType: "INDIVIDUAL" }),
    "CANDIDATE",
  );
});

test("syncs the configured password and enables an existing Super Admin account", async () => {
  const existing = {
    email: "admin@example.com",
    role: "USER",
    password: "existing-password",
    isVerified: false,
    isActive: false,
    saveCalls: 0,
    async comparePassword(candidate) {
      return this.password === candidate;
    },
    async save() {
      this.saveCalls += 1;
    },
  };
  class UserModel {
    static findOne() {
      return {
        select: async () => existing,
      };
    }
  }

  assert.equal(
    await initializeSuperAdmin({
      userModel: UserModel,
      email: "admin@example.com",
      password: "new-configured-password",
    }),
    "existing",
  );
  assert.equal(existing.role, "ADMIN");
  assert.equal(existing.password, "new-configured-password");
  assert.equal(existing.isVerified, true);
  assert.equal(existing.isActive, true);
  assert.equal(existing.saveCalls, 1);
});

test("defers new Super Admin creation when no password is configured", async () => {
  class UserModel {
    static async findOne() {
      return null;
    }
  }

  assert.equal(
    await initializeSuperAdmin({
      userModel: UserModel,
      email: "admin@example.com",
      password: "",
    }),
    "deferred",
  );
});

test("creates a Super Admin only with a configured valid password", async () => {
  let createdUser;
  class UserModel {
    constructor(data) {
      Object.assign(this, data);
      createdUser = this;
    }

    static async findOne() {
      return null;
    }

    async save() {}
  }

  assert.equal(
    await initializeSuperAdmin({
      userModel: UserModel,
      email: "admin@example.com",
      password: "configured-secret",
    }),
    "created",
  );
  assert.equal(createdUser.email, "admin@example.com");
  assert.equal(createdUser.role, "ADMIN");
  assert.equal(createdUser.password, "configured-secret");
  assert.equal(createdUser.isVerified, true);
});
