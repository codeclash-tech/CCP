import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Challenge from "../src/models/Challenge.js";

test("participant challenge data exposes unified test cases but omits reference solutions", () => {
  const challenge = new Challenge({
    title: "Reference output protection",
    slug: "reference-output-protection",
    description: "A serialization regression test.",
    createdBy: new mongoose.Types.ObjectId(),
    signature: { name: "answer", returnType: "int", params: [] },
    referenceSolutions: {
      java: "public class Solution { public int answer() { return 42; } }",
    },
    visibleTestCases: [
      { input: "", expectedOutput: "42", isHidden: false },
      { input: "secret", expectedOutput: "private", isHidden: true },
    ],
    hiddenTestCases: [
      { input: "secret", expectedOutput: "private", isHidden: true },
    ],
  });

  const participantData = challenge.toUserJSON();
  const participantJson = JSON.stringify(participantData);
  assert.equal("referenceSolutions" in participantData, false);
  assert.equal(participantJson.includes("public class Solution"), false);
  assert.equal(participantJson.includes("secret"), true);
  assert.equal("visibleTestCases" in participantData, false);
  assert.equal("hiddenTestCases" in participantData, false);
  assert.deepEqual(
    participantData.testCases.map((testCase) => testCase.expectedOutput),
    ["42", "private"],
  );
});

test("admin challenge serialization returns a unified test case collection", () => {
  const challenge = new Challenge({
    title: "Admin authoring data",
    slug: "admin-authoring-data",
    description: "An authoring serialization regression test.",
    createdBy: new mongoose.Types.ObjectId(),
    referenceSolutions: { java: "class Solution {}" },
    visibleTestCases: [{ input: "1", expectedOutput: "1" }],
    hiddenTestCases: [{ input: "2", expectedOutput: "2", isHidden: true }],
  });

  const adminData = challenge.toAdminJSON();
  assert.deepEqual(adminData.referenceSolutions, { java: "class Solution {}" });
  assert.deepEqual(adminData.testCases.map((testCase) => testCase.expectedOutput), ["1", "2"]);
  assert.equal("visibleTestCases" in adminData, false);
  assert.equal("hiddenTestCases" in adminData, false);
});
