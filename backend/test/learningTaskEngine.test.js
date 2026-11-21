import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMathematicsTask } from "../src/services/learningTaskEngine.js";

test("mathematics task accepts equivalent arithmetic expressions", () => {
  const result = evaluateMathematicsTask({
    type: "MATH",
    expectedAnswer: "4",
    numericTolerance: 0,
  }, { answer: "(10 - 2) / 2" });

  assert.equal(result.accepted, true);
  assert.equal(result.status, "CORRECT");
});

test("mathematics task converts supported equivalent units and applies tolerance", () => {
  const converted = evaluateMathematicsTask({
    expectedAnswer: "1",
    unit: "m",
    requireUnit: true,
    numericTolerance: 0.0001,
  }, { answer: "100 cm" });
  const withinTolerance = evaluateMathematicsTask({
    expectedAnswer: "3.14159",
    numericTolerance: 0.00001,
  }, { answer: "3.1416" });

  assert.equal(converted.accepted, true);
  assert.equal(withinTolerance.accepted, true);
});

test("mathematics task accepts equivalent ratios, percentages, roots, and compact units", () => {
  const ratio = evaluateMathematicsTask(
    { expectedAnswer: "1:2" },
    { answer: "2:4" },
  );
  const percentage = evaluateMathematicsTask(
    { expectedAnswer: "50%" },
    { answer: "0.5" },
  );
  const root = evaluateMathematicsTask(
    { expectedAnswer: "3" },
    { answer: "sqrt(9)" },
  );
  const compactUnit = evaluateMathematicsTask(
    { expectedAnswer: "1", unit: "m", requireUnit: true },
    { answer: "100cm" },
  );

  assert.equal(ratio.accepted, true);
  assert.equal(percentage.accepted, true);
  assert.equal(root.accepted, true);
  assert.equal(compactUnit.accepted, true);
});

test("mathematics task evaluates bounded variable substitution without dynamic code execution", () => {
  const substitutedFormula = evaluateMathematicsTask(
    {
      expectedAnswer: "distance / time",
      variables: { distance: 100, time: 20 },
    },
    { answer: "100 / 20" },
  );
  const substitutedRoot = evaluateMathematicsTask(
    {
      expectedAnswer: "sqrt(area)",
      variables: { area: 81 },
    },
    { answer: "3 ^ 2" },
  );
  const suffixNamedVariable = evaluateMathematicsTask(
    { expectedAnswer: "mass", variables: { mass: 12 } },
    { answer: "mass" },
  );
  const invalidVariables = evaluateMathematicsTask(
    {
      expectedAnswer: "distance / time",
      variables: { distance: "not-a-number", time: 20 },
    },
    { answer: "5" },
  );

  assert.equal(substitutedFormula.accepted, true);
  assert.equal(substitutedRoot.accepted, true);
  assert.equal(suffixNamedVariable.accepted, true);
  assert.equal(invalidVariables.status, "UNSUPPORTED_VARIABLES");
});

test("mathematics task distinguishes incorrect, incomplete, and unsafe expressions", () => {
  const incorrect = evaluateMathematicsTask(
    { expectedAnswer: "8" },
    { answer: "3 * 3" },
  );
  const missingSteps = evaluateMathematicsTask(
    { expectedAnswer: "8", requireReasoning: true },
    { answer: "8" },
  );
  const unsupported = evaluateMathematicsTask(
    { expectedAnswer: "8" },
    { answer: "process.exit()" },
  );
  const invalidRoot = evaluateMathematicsTask(
    { expectedAnswer: "8" },
    { answer: "sqrt(-1)" },
  );
  const invalidRatio = evaluateMathematicsTask(
    { expectedAnswer: "1:2" },
    { answer: "1:0" },
  );

  assert.equal(incorrect.status, "INCORRECT_VALUE");
  assert.equal(missingSteps.status, "REASONING_REQUIRED");
  assert.equal(unsupported.status, "UNSUPPORTED_EXPRESSION");
  assert.equal(invalidRoot.status, "UNSUPPORTED_EXPRESSION");
  assert.equal(invalidRatio.status, "UNSUPPORTED_EXPRESSION");
});

test("mathematics task rejects mismatched units and missing required units", () => {
  const wrongUnit = evaluateMathematicsTask(
    { expectedAnswer: "2", unit: "m", requireUnit: true },
    { answer: "2 kg" },
  );
  const missingUnit = evaluateMathematicsTask(
    { expectedAnswer: "2", unit: "m", requireUnit: true },
    { answer: "2" },
  );

  assert.equal(wrongUnit.status, "UNIT_MISMATCH");
  assert.equal(missingUnit.status, "UNIT_REQUIRED");
});
