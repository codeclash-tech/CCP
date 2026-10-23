import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSESSMENT_ROLES,
  canAccessRoute,
  getAssessmentRole,
  hasAnyAssessmentRole,
} from "../src/routes/roleAccess.js";
import { ROLE_NAVIGATION } from "../src/routes/roleNavigation.js";
import { DEVELOPMENT_ROUTES } from "../src/routes/developmentRoutes.js";

test("uses the backend assessment role for navigation and route access", () => {
  assert.equal(
    getAssessmentRole({
      assessmentRole: ASSESSMENT_ROLES.ORGANIZATION_USER,
      role: "USER",
    }),
    ASSESSMENT_ROLES.ORGANIZATION_USER,
  );
});

test("maps persisted ADMIN users to Super Admin", () => {
  assert.equal(
    getAssessmentRole({ role: "ADMIN" }),
    ASSESSMENT_ROLES.SUPER_ADMIN,
  );
  assert.equal(
    hasAnyAssessmentRole({ role: "ADMIN" }, [
      ASSESSMENT_ROLES.SUPER_ADMIN,
    ]),
    true,
  );
});

test("candidate and organization users cannot access Super Admin routes", () => {
  const adminOnly = [ASSESSMENT_ROLES.SUPER_ADMIN];
  assert.equal(
    hasAnyAssessmentRole({ assessmentRole: "CANDIDATE", role: "USER" }, adminOnly),
    false,
  );
  assert.equal(
    hasAnyAssessmentRole(
      { assessmentRole: "ORGANIZATION_USER", role: "USER" },
      adminOnly,
    ),
    false,
  );
  for (const path of ["/admin", "/admin/questions", "/admin/weekly-roster"]) {
    assert.equal(
      canAccessRoute({ assessmentRole: "CANDIDATE", role: "USER" }, path),
      false,
    );
    assert.equal(
      canAccessRoute(
        { assessmentRole: "ORGANIZATION_USER", role: "USER" },
        path,
      ),
      false,
    );
  }
});

test("only Super Admin users pass protected admin routes", () => {
  assert.equal(
    canAccessRoute({ assessmentRole: "SUPER_ADMIN", role: "ADMIN" }, "/admin"),
    true,
  );
  assert.equal(
    canAccessRoute(
      { assessmentRole: "SUPER_ADMIN", role: "USER" },
      "/admin/weekly-roster",
    ),
    false,
  );
});

test("role navigation keeps admin links exclusive and removes settings/create shortcuts", () => {
  for (const role of [
    ASSESSMENT_ROLES.CANDIDATE,
    ASSESSMENT_ROLES.ORGANIZATION_USER,
  ]) {
    assert.equal(
      ROLE_NAVIGATION[role].some(({ path }) => path.startsWith("/admin")),
      false,
    );
  }
  assert.ok(
    ROLE_NAVIGATION[ASSESSMENT_ROLES.SUPER_ADMIN].some(({ path }) =>
      path.startsWith("/admin"),
    ),
  );
  assert.equal(
    ROLE_NAVIGATION[ASSESSMENT_ROLES.SUPER_ADMIN].some(({ path }) =>
      ["/settings", "/battle-room/create"].includes(path),
    ),
    false,
  );
  assert.deepEqual(
    ROLE_NAVIGATION[ASSESSMENT_ROLES.SUPER_ADMIN]
      .filter(({ path }) => path.startsWith("/admin"))
      .map(({ path }) => path),
    ["/admin/weekly-assessment", "/admin/questions", "/admin/rankings"],
  );
  for (const links of Object.values(ROLE_NAVIGATION)) {
    assert.equal(
      links.some(({ path }) => ["/assessments", "/results"].includes(path)),
      false,
    );
  }
});

test("every role navigation destination has an existing or explicit route", () => {
  const existingRoutes = new Set([
    "/",
    "/battle-room",
    "/battle-room/create",
    "/profile",
  ]);
  for (const navigationItems of Object.values(ROLE_NAVIGATION)) {
    for (const { path } of navigationItems) {
      assert.equal(
        existingRoutes.has(path) || Boolean(DEVELOPMENT_ROUTES[path]),
        true,
        `Missing route registration for ${path}`,
      );
    }
  }
});

test("legacy results and participant URLs remain role-accessible redirects while room editing stays restricted", () => {
  assert.equal(
    canAccessRoute({ assessmentRole: "CANDIDATE", role: "USER" }, "/assessments/edit"),
    false,
  );
  for (const path of ["/assessments/edit", "/participants", "/results"]) {
    if (path === "/assessments/edit") continue;
    assert.equal(canAccessRoute({ assessmentRole: "CANDIDATE", role: "USER" }, path), true);
    assert.equal(
      canAccessRoute({ assessmentRole: "ORGANIZATION_USER", role: "USER" }, path),
      true,
    );
  }
});

test("a user response cannot claim Super Admin through assessmentRole alone", () => {
  const inconsistentUser = {
    assessmentRole: "SUPER_ADMIN",
    role: "USER",
  };
  assert.equal(getAssessmentRole(inconsistentUser), ASSESSMENT_ROLES.CANDIDATE);
  assert.equal(canAccessRoute(inconsistentUser, "/admin"), false);
});
