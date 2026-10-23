import assert from "node:assert/strict";
import test from "node:test";
import BattleRoom from "../src/models/BattleRoom.js";

test("public room serialization includes visible cases but omits protected authoring data", () => {
  const room = new BattleRoom({
    roomCode: "PUBLIC1",
    title: "Serialization test",
    questions: [
      {
        title: "Sum",
        description: "Add two values.",
        signature: {
          name: "sum",
          returnType: "int",
          params: [{ name: "values", type: "int[]" }],
        },
        visibleTestCases: [{ input: "1\n2", expectedOutput: "3" }],
        hiddenTestCases: [{ input: "999\n1", expectedOutput: "1000" }],
        referenceSolution: "public class Solution {}",
      },
    ],
  });

  const publicQuestion = JSON.parse(JSON.stringify(room.toPublicJSON())).questions[0];
  assert.equal(publicQuestion.visibleTestCases.length, 1);
  assert.deepEqual(publicQuestion.visibleTestCases[0], {
    input: "1\n2",
    expectedOutput: "3",
    description: "",
    parameterValues: null,
  });
  assert.equal("hiddenTestCases" in publicQuestion, false);
  assert.equal("referenceSolution" in publicQuestion, false);
});

test("creator serialization still retains hidden cases and reference solution", () => {
  const room = new BattleRoom({
    roomCode: "OWNER01",
    title: "Creator serialization test",
    questions: [
      {
        title: "Sum",
        description: "Add two values.",
        visibleTestCases: [],
        hiddenTestCases: [{ input: "999\n1", expectedOutput: "1000" }],
        referenceSolution: "public class Solution {}",
      },
    ],
  });

  const creatorQuestion = room.toCreatorJSON().questions[0];
  assert.equal(creatorQuestion.hiddenTestCases.length, 1);
  assert.equal(creatorQuestion.referenceSolution, "public class Solution {}");
});
