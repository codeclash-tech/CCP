import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import OrganizationProfile from "../src/models/OrganizationProfile.js";
import WeeklyCertificate from "../src/models/WeeklyCertificate.js";
import WeeklyRosterEntry from "../src/models/WeeklyRosterEntry.js";
import { downloadWeeklyCertificate } from "../src/controllers/weeklyAssessmentController.js";
import { getWeeklyCycleBounds } from "../src/utils/weeklyAssessment.js";

function responseRecorder() {
  const response = new PassThrough();
  response.statusCode = 200;
  response.body = null;
  response.headers = {};
  response.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  response.json = function json(body) {
    this.body = body;
    return this;
  };
  response.setHeader = function setHeader(name, value) {
    this.headers[name] = value;
  };
  return response;
}

async function withCertificateMocks(
  certificate,
  organizationExists,
  run,
  rosterEntry = {
    participationStatus: "PARTICIPATED",
    passedTestCases: 4,
    totalTestCases: 4,
    resultFinalizedAt: new Date("2026-05-04T00:00:00.000Z"),
    disqualifiedAt: null,
  },
) {
  const originalFindOne = WeeklyCertificate.findOne;
  const originalDeleteOne = WeeklyCertificate.deleteOne;
  const originalExists = OrganizationProfile.exists;
  const originalRosterFindOne = WeeklyRosterEntry.findOne;
  const deletedCertificates = [];
  WeeklyCertificate.findOne = () => ({ lean: async () => certificate });
  WeeklyCertificate.deleteOne = async (filter) => {
    deletedCertificates.push(filter);
    return { deletedCount: 1 };
  };
  OrganizationProfile.exists = organizationExists;
  WeeklyRosterEntry.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => rosterEntry,
  });
  try {
    await run();
    return deletedCertificates;
  } finally {
    WeeklyCertificate.findOne = originalFindOne;
    WeeklyCertificate.deleteOne = originalDeleteOne;
    OrganizationProfile.exists = originalExists;
    WeeklyRosterEntry.findOne = originalRosterFindOne;
  }
}

test("weekly certificate download rejects disqualified, incomplete, zero-pass, and unranked results", async () => {
  const ineligibleResults = [
    {
      category: "PARTICIPATION",
      rosterEntry: {
        participationStatus: "DISQUALIFIED",
        passedTestCases: 4,
        totalTestCases: 4,
        resultFinalizedAt: new Date("2026-05-04T00:00:00.000Z"),
        disqualifiedAt: new Date("2026-05-04T00:00:00.000Z"),
      },
    },
    {
      category: "PARTICIPATION",
      rosterEntry: {
        participationStatus: "PARTICIPATED",
        passedTestCases: 1,
        totalTestCases: 4,
        resultFinalizedAt: null,
        disqualifiedAt: null,
      },
    },
    {
      category: "PARTICIPATION",
      rosterEntry: {
        participationStatus: "PARTICIPATED",
        passedTestCases: 0,
        totalTestCases: 4,
        resultFinalizedAt: new Date("2026-05-04T00:00:00.000Z"),
        disqualifiedAt: null,
      },
    },
    {
      category: "WINNER",
      rosterEntry: {
        participationStatus: "PARTICIPATED",
        passedTestCases: 1,
        totalTestCases: 4,
        resultFinalizedAt: new Date("2026-05-04T00:00:00.000Z"),
        disqualifiedAt: null,
      },
    },
  ];

  for (const [index, result] of ineligibleResults.entries()) {
    const res = responseRecorder();
    await withCertificateMocks(
      {
        certificateId: `WK-ineligible-${index}`,
        cycleId: "cycle-1",
        type: "INDIVIDUAL",
        category: result.category,
        userId: "candidate-a",
      },
      async () => false,
      async () => {
        await downloadWeeklyCertificate(
          {
            params: { certificateId: `WK-ineligible-${index}` },
            userId: "candidate-a",
            user: { role: "USER", creatorType: null },
          },
          res,
        );
      },
      result.rosterEntry,
    );
    assert.equal(res.statusCode, 404);
  }
});

test("candidate cannot download another candidate's weekly certificate", async () => {
  const res = responseRecorder();
  await withCertificateMocks(
    {
      certificateId: "WK-private",
      type: "INDIVIDUAL",
      userId: "candidate-b",
      organizationId: null,
      snapshot: {},
    },
    async () => false,
    async () => {
      await downloadWeeklyCertificate(
        {
          params: { certificateId: "WK-private" },
          userId: "candidate-a",
          user: { role: "USER", creatorType: null },
        },
        res,
      );
    },
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "You are not authorized to download this certificate.");
});

test("organization user cannot download another organization's weekly certificate", async () => {
  const res = responseRecorder();
  let ownershipFilter;
  await withCertificateMocks(
    {
      certificateId: "WK-org-private",
      type: "ORGANIZATION",
      userId: null,
      organizationId: "organization-b",
      snapshot: {},
    },
    async (filter) => {
      ownershipFilter = filter;
      return false;
    },
    async () => {
      await downloadWeeklyCertificate(
        {
          params: { certificateId: "WK-org-private" },
          userId: "organization-a-owner",
          user: { role: "USER", creatorType: "ORGANIZATION" },
        },
        res,
      );
    },
  );
  assert.deepEqual(ownershipFilter, {
    _id: "organization-b",
    ownerUserId: "organization-a-owner",
  });
  assert.equal(res.statusCode, 403);
});

test("daily certificate is unavailable until the following India calendar day", async () => {
  const cycleKey = getWeeklyCycleBounds(new Date()).cycleKey;
  const res = responseRecorder();
  await withCertificateMocks(
    {
      certificateId: "DLY-locked",
      cycleId: "cycle-1",
      type: "INDIVIDUAL",
      category: "PARTICIPATION",
      userId: "candidate-a",
      snapshot: {
        cycleKey,
        rank: null,
      },
    },
    async () => false,
    async () => {
      await downloadWeeklyCertificate(
        {
          params: { certificateId: "DLY-locked" },
          userId: "candidate-a",
          user: { role: "USER", creatorType: null },
        },
        res,
      );
    },
  );
  assert.equal(res.statusCode, 404);
});

test("Super Admin is authorized to download an administrative weekly certificate", async () => {
  const res = responseRecorder();
  const chunks = [];
  res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise((resolve, reject) => {
    res.once("end", resolve);
    res.once("error", reject);
  });
  const deletedCertificates = await withCertificateMocks(
    {
      certificateId: "WK-admin-download",
      cycleId: "cycle-1",
      type: "INDIVIDUAL",
      userId: "candidate-b",
      organizationId: null,
      category: "WINNER",
      snapshot: {
        subjectName: "Candidate",
        assessmentName: "Weekly",
        cycleKey: "2026-05-04",
        score: 100,
        rank: 1,
        issuedAt: new Date("2026-05-04T00:00:00.000Z"),
      },
    },
    async () => false,
    async () => {
      await downloadWeeklyCertificate(
        {
          params: { certificateId: "WK-admin-download" },
          userId: "super-admin",
          user: { role: "ADMIN", creatorType: null },
        },
        res,
      );
      await completed;
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(chunks.length > 0, true);
  assert.match(Buffer.concat(chunks).subarray(0, 5).toString(), /^%PDF-/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(deletedCertificates, [
    { certificateId: "WK-admin-download" },
  ]);
});
