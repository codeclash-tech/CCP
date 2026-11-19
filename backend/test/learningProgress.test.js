import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateLearningAssessment,
  meetsModuleCompletionRequirements,
  normalizeLearningAnswer,
} from "../src/services/learningProgress.js";
import { serializeStudentModule } from "../src/services/learningService.js";

test("normalizes whitespace and case in authored assessment answers", () => {
  assert.equal(normalizeLearningAnswer("  Public   Static  "), "public static");
  const result = evaluateLearningAssessment(
    [
      { _id: "q1", expectedAnswer: "Java Virtual Machine" },
      { _id: "q2", expectedAnswer: "bytecode", acceptedAnswers: [" JVM instructions "] },
    ],
    { q1: " java virtual machine ", q2: "JVM instructions" },
    100,
  );
  assert.equal(result.passed, true);
  assert.equal(result.scorePercent, 100);
});

test("does not pass an assessment with missing or incorrect answers", () => {
  const result = evaluateLearningAssessment(
    [{ _id: "q1", expectedAnswer: "JVM" }],
    { q1: "compiler" },
    70,
  );
  assert.equal(result.passed, false);
  assert.equal(result.results[0].correct, false);
});

test("module completion requires every configured server-side criterion", () => {
  const module = {
    topics: [{ _id: "one" }, { _id: "two" }],
    completionRequirements: {
      minCompletedTopics: 2,
      requireAssessment: true,
      requiredExercises: 1,
    },
  };
  assert.equal(
    meetsModuleCompletionRequirements(module, {
      completedTopicIds: ["one", "two"],
      completedExerciseIds: ["exercise"],
      assessmentPassed: false,
    }),
    false,
  );
  assert.equal(
    meetsModuleCompletionRequirements(module, {
      completedTopicIds: ["one"],
      completedExerciseIds: ["exercise"],
      assessmentPassed: true,
    }),
    false,
  );
  assert.equal(
    meetsModuleCompletionRequirements(module, {
      completedTopicIds: ["one", "two"],
      completedExerciseIds: ["exercise"],
      assessmentPassed: true,
    }),
    true,
  );
});

test("student module serialization hides answer keys and hidden exercise tests", () => {
  const module = serializeStudentModule({
    topics: [{
      title: "Topic",
      questions: [{ _id: "question-1", prompt: "Question", expectedAnswer: "answer" }],
      exercises: [{
        _id: "exercise-1",
        tests: [
          { input: "visible", expectedOutput: "public result", visible: true },
          { input: "secret input", expectedOutput: "secret result", visible: false },
        ],
      }],
      subtopics: [{
        title: "Subtopic",
        questions: [{ _id: "question-2", prompt: "Question", expectedAnswer: "secret answer" }],
        exercises: [{
          _id: "exercise-2",
          tests: [{ input: "secret input", expectedOutput: "secret result", visible: false }],
        }],
      }],
    }],
    assessment: {
      questions: [{ _id: "assessment-1", prompt: "Question", expectedAnswer: "assessment answer" }],
    },
  });

  const studentData = JSON.stringify(module);
  assert.equal(studentData.includes("expectedAnswer"), false);
  assert.equal(studentData.includes("secret input"), false);
  assert.equal(studentData.includes("secret result"), false);
  assert.equal(studentData.includes("public result"), false);
});
