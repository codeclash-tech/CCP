import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import BattleRoom from "../src/models/BattleRoom.js";
import BattleRoomSubmission from "../src/models/BattleRoomSubmission.js";
import Nonce from "../src/models/Nonce.js";
import {
  prepareDesktopSubmission,
  submitQuestionSolution,
} from "../src/controllers/battleRoomController.js";
import { executionService } from "../src/services/executionService.js";

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function activeRoom(roomId, questionId) {
  return {
    _id: roomId,
    roomCode: "ABC234",
    isActive: true,
    isDeleted: false,
    startTime: new Date(Date.now() - 60_000),
    endTime: new Date(Date.now() + 60_000),
    questions: [
      {
        _id: questionId,
        visibleTestCases: [{ input: "1", expectedOutput: "1" }],
        hiddenTestCases: [{ input: "999", expectedOutput: "999" }],
      },
    ],
  };
}

test("issues a one-use grant containing only visible cases to a joined candidate", async (t) => {
  const roomId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const submissionId = new mongoose.Types.ObjectId();
  const room = activeRoom(roomId, questionId);
  t.mock.method(BattleRoom, "findOne", () => ({ lean: async () => room }));
  t.mock.method(BattleRoomSubmission, "findOne", () => ({
    lean: async () => ({
      _id: submissionId,
      status: "PENDING",
      questionResults: [{ questionId }],
    }),
  }));
  t.mock.method(Nonce, "findOne", () => ({ lean: async () => null }));
  let nonceArguments;
  const nonceValue = "a".repeat(64);
  t.mock.method(Nonce, "generate", async (...args) => {
    nonceArguments = args;
    return nonceValue;
  });

  const res = responseRecorder();
  await prepareDesktopSubmission(
    {
      params: { roomCode: "ABC234" },
      body: { questionId: questionId.toString(), codeHash: "c".repeat(64) },
      userId,
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.nonce, nonceValue);
  assert.equal(res.body.visibleTestCaseCount, 1);
  assert.deepEqual(res.body.testCases, [{ input: "1", expectedOutput: "1" }]);
  assert.equal(JSON.stringify(res.body).includes("999"), false);
  assert.equal(res.body.timeLimit, 5_000);
  assert.equal(res.body.memoryLimit, 131_072);
  assert.deepEqual(nonceArguments, [
    userId,
    "SUBMIT",
    `${roomId}:${submissionId}:${questionId}:${"c".repeat(64)}`,
    5 * 60 * 1000,
  ]);
});

test("reuses an unexpired authorization after a repeated grant request", async (t) => {
  const roomId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const submissionId = new mongoose.Types.ObjectId();
  const nonce = "f".repeat(64);
  t.mock.method(BattleRoom, "findOne", () => ({
    lean: async () => activeRoom(roomId, questionId),
  }));
  t.mock.method(BattleRoomSubmission, "findOne", () => ({
    lean: async () => ({
      _id: submissionId,
      status: "PENDING",
      questionResults: [{ questionId }],
    }),
  }));
  let grantQuery;
  t.mock.method(Nonce, "findOne", (query) => {
    grantQuery = query;
    return {
      lean: async () => ({
        nonce,
        state: "RETRYABLE",
      }),
    };
  });
  t.mock.method(Nonce, "generate", async () => {
    assert.fail("A retry must reuse the existing grant.");
  });

  const res = responseRecorder();
  await prepareDesktopSubmission(
    {
      params: { roomCode: "ABC234" },
      body: {
        questionId: questionId.toString(),
        codeHash: "c".repeat(64),
      },
      userId,
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.nonce, nonce);
  assert.equal(grantQuery.userId, userId);
  assert.equal(
    grantQuery.resourceId,
    `${roomId}:${submissionId}:${questionId}:${"c".repeat(64)}`,
  );
});

test("reissues a reconciliation grant for a completed result after the room closes", async (t) => {
  const roomId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const submissionId = new mongoose.Types.ObjectId();
  const code = "class Main { }";
  const nonce = "9".repeat(64);
  const room = {
    ...activeRoom(roomId, questionId),
    endTime: new Date(Date.now() - 1_000),
  };
  const codeHash = createHash("sha256").update(code, "utf8").digest("hex");
  t.mock.method(BattleRoom, "findOne", () => ({ lean: async () => room }));
  t.mock.method(BattleRoomSubmission, "findOne", () => ({
    lean: async () => ({
      _id: submissionId,
      status: "COMPLETED",
      questionResults: [
        { questionId, status: "ACCEPTED", code },
      ],
    }),
  }));
  let grantQuery;
  t.mock.method(Nonce, "findOne", (query) => {
    grantQuery = query;
    return { lean: async () => ({ nonce, state: "COMPLETED" }) };
  });
  t.mock.method(Nonce, "generate", async () => {
    assert.fail("A persisted result should reuse its reconciliation grant.");
  });

  const res = responseRecorder();
  await prepareDesktopSubmission(
    {
      params: { roomCode: "ABC234" },
      body: { questionId: questionId.toString(), codeHash },
      userId,
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.nonce, nonce);
  assert.deepEqual(res.body.testCases, [{ input: "1", expectedOutput: "1" }]);
  assert.equal(
    grantQuery.resourceId,
    `${roomId}:${submissionId}:${questionId}:${codeHash}`,
  );
});

test("does not authorize new code for a completed submission after the room closes", async (t) => {
  const roomId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const room = {
    ...activeRoom(roomId, questionId),
    endTime: new Date(Date.now() - 1_000),
  };
  t.mock.method(BattleRoom, "findOne", () => ({ lean: async () => room }));
  t.mock.method(BattleRoomSubmission, "findOne", () => ({
    lean: async () => ({
      status: "COMPLETED",
      questionResults: [
        { questionId, status: "ACCEPTED", code: "class Main {}" },
      ],
    }),
  }));
  let nonceIssued = false;
  t.mock.method(Nonce, "findOne", () => {
    nonceIssued = true;
    return { lean: async () => null };
  });
  t.mock.method(Nonce, "generate", async () => {
    assert.fail("A completed room must not authorize new source.");
  });

  const res = responseRecorder();
  await prepareDesktopSubmission(
    {
      params: { roomCode: "ABC234" },
      body: {
        questionId: questionId.toString(),
        codeHash: createHash("sha256")
          .update("class Main { int changed; }", "utf8")
          .digest("hex"),
      },
      userId,
    },
    res,
  );

  assert.equal(res.statusCode, 409);
  assert.equal(nonceIssued, false);
});

test("does not issue hidden-case grants to a user without a room submission", async (t) => {
  const roomId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();
  t.mock.method(BattleRoom, "findOne", () => ({
    lean: async () => activeRoom(roomId, questionId),
  }));
  t.mock.method(BattleRoomSubmission, "findOne", () => ({
    lean: async () => null,
  }));
  let nonceGenerated = false;
  t.mock.method(Nonce, "generate", async () => {
    nonceGenerated = true;
    return "unused";
  });

  const res = responseRecorder();
  await prepareDesktopSubmission(
    {
      params: { roomCode: "ABC234" },
      body: { questionId: questionId.toString(), codeHash: "c".repeat(64) },
      userId: new mongoose.Types.ObjectId(),
    },
    res,
  );

  assert.equal(res.statusCode, 403);
  assert.equal(nonceGenerated, false);
  assert.equal(res.body.error, "You have not joined this battle.");
});

test("independently executes desktop code on the backend and uses only backend results", async (t) => {
  const roomId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const submissionId = new mongoose.Types.ObjectId();
  const question = {
    _id: questionId,
    title: "Add two values",
    points: 100,
    visibleTestCases: [{ input: "1 2", expectedOutput: "3" }],
    hiddenTestCases: [{ input: "999 1", expectedOutput: "1000" }],
  };
  const room = {
    ...activeRoom(roomId, questionId),
    status: "ACTIVE",
    questions: [question],
  };
  const submission = {
    _id: submissionId,
    status: "PENDING",
    startTime: new Date(Date.now() - 10_000),
    questionResults: [
      {
        questionId,
        status: "PENDING",
        revision: 0,
        score: 0,
        passed: 0,
        failed: 0,
        code: "",
      },
    ],
  };
  const currentSubmission = {
    status: "PENDING",
    totalScore: 50,
    totalPassed: 1,
    totalFailed: 1,
    questionResults: [{ status: "WRONG_ANSWER" }],
  };
  const code = "public class Main { public static void main(String[] args) {} }";
  const nonce = "a".repeat(64);
  let executionArguments;
  let persistedQuestionResult;
  let findByIdCalls = 0;
  let grantCompleted = false;

  t.mock.method(BattleRoom, "findOne", () => ({ lean: async () => room }));
  t.mock.method(BattleRoomSubmission, "findOne", () => ({
    select() {
      return this;
    },
    lean: async () => submission,
  }));
  t.mock.method(Nonce, "claimDesktopSubmission", async (claimedUser, claimedNonce, resourceId) => {
    assert.equal(claimedUser, userId);
    assert.equal(claimedNonce, nonce);
    assert.equal(
      resourceId,
      `${roomId}:${submissionId}:${questionId}:${createHash("sha256")
        .update(code, "utf8")
        .digest("hex")}`,
    );
    return {
      nonce: { _id: new mongoose.Types.ObjectId(), state: "PROCESSING" },
      claimId: "claim-1",
      claimed: true,
    };
  });
  t.mock.method(Nonce, "completeDesktopSubmission", async () => {
    grantCompleted = true;
    return { state: "COMPLETED" };
  });
  t.mock.method(executionService, "execute", async (...args) => {
    executionArguments = args;
    return {
      status: "WRONG_ANSWER",
      passed: 1,
      failed: 1,
      total: 2,
      executionTime: 14,
      memoryUsed: 2_048,
      output: "3\nnot-1000",
      results: [
        {
          testCase: 1,
          input: "1 2",
          status: "PASSED",
          output: "3",
          expectedOutput: "3",
          executionTime: 7,
          memoryUsed: 1_024,
        },
        {
          testCase: 2,
          input: "999 1",
          status: "WRONG_ANSWER",
          output: "not-1000",
          expectedOutput: "1000",
          executionTime: 7,
          memoryUsed: 2_048,
        },
      ],
    };
  });
  t.mock.method(BattleRoomSubmission, "updateOne", async (_query, update) => {
    if (update.$set?.["questionResults.0"]) {
      persistedQuestionResult = update.$set["questionResults.0"];
    }
    return { matchedCount: 1 };
  });
  t.mock.method(BattleRoomSubmission, "findById", () => {
    findByIdCalls += 1;
    return {
      lean: async () => ({
        ...currentSubmission,
        status: findByIdCalls === 1 ? "PENDING" : "COMPLETED",
      }),
    };
  });

  const res = responseRecorder();
  await submitQuestionSolution(
    {
      params: { roomCode: "ABC234" },
      body: {
        questionId: questionId.toString(),
        code,
        language: "java",
        desktopNonce: nonce,
      },
      userId,
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(grantCompleted, true);
  assert.equal(executionArguments[0], code);
  assert.deepEqual(
    executionArguments[1].map(({ input, expectedOutput }) => ({
      input,
      expectedOutput,
    })),
    [
      { input: "1 2", expectedOutput: "3" },
      { input: "999 1", expectedOutput: "1000" },
    ],
  );
  assert.equal(persistedQuestionResult.status, "WRONG_ANSWER");
  assert.equal(persistedQuestionResult.executionGrantNonce, nonce);
  assert.equal(persistedQuestionResult.passed, 1);
  assert.equal(persistedQuestionResult.results[1].isHidden, true);
  assert.equal("input" in persistedQuestionResult.results[1], false);
  assert.equal("output" in persistedQuestionResult.results[1], false);
  assert.equal("expectedOutput" in persistedQuestionResult.results[1], false);
  assert.equal(res.body.questionResult.score, 50);
  assert.equal(res.body.questionResult.results[1].status, "WRONG_ANSWER");
  assert.equal("output" in res.body.questionResult.results[1], false);
  assert.equal("input" in res.body.questionResult.results[1], false);
  assert.equal("expectedOutput" in res.body.questionResult.results[1], false);
  assert.equal(JSON.stringify(res.body).includes("not-1000"), false);
});

test("rejects client-reported local results instead of treating them as score evidence", async (t) => {
  let executionCalled = false;
  t.mock.method(executionService, "execute", async () => {
    executionCalled = true;
    throw new Error("Client receipt must not reach the judge.");
  });
  const res = responseRecorder();

  await submitQuestionSolution(
    {
      params: { roomCode: "ABC234" },
      body: {
        questionId: "507f1f77bcf86cd799439011",
        code: "class Main {}",
        desktopNonce: "c".repeat(64),
        localExecution: { status: "ACCEPTED" },
      },
      userId: new mongoose.Types.ObjectId(),
    },
    res,
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Client-reported execution results/);
  assert.equal(executionCalled, false);
});

test("rejects a replayed desktop nonce before running the backend judge", async (t) => {
  const roomId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const submissionId = new mongoose.Types.ObjectId();
  const code = "class Main {}";
  const room = {
    ...activeRoom(roomId, questionId),
    questions: [
      {
        _id: questionId,
        visibleTestCases: [{ input: "1", expectedOutput: "1" }],
        hiddenTestCases: [],
      },
    ],
  };
  t.mock.method(BattleRoom, "findOne", () => ({ lean: async () => room }));
  t.mock.method(BattleRoomSubmission, "findOne", () => ({
    lean: async () => ({
      _id: submissionId,
      status: "PENDING",
      startTime: new Date(),
      questionResults: [{ questionId, status: "PENDING" }],
    }),
  }));
  t.mock.method(Nonce, "claimDesktopSubmission", async () => ({
    nonce: { state: "PROCESSING" },
    claimId: null,
    claimed: false,
  }));
  let executionCalled = false;
  t.mock.method(executionService, "execute", async () => {
    executionCalled = true;
    throw new Error("A replay must not execute.");
  });

  const res = responseRecorder();
  await submitQuestionSolution(
    {
      params: { roomCode: "ABC234" },
      body: {
        questionId: questionId.toString(),
        code,
        desktopNonce: "b".repeat(64),
      },
      userId,
    },
    res,
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "SUBMISSION_IN_PROGRESS");
  assert.equal(res.body.retryable, true);
  assert.equal(executionCalled, false);
});

test("retries judge and persistence failures with the same authorization", async (t) => {
  const roomId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const submissionId = new mongoose.Types.ObjectId();
  const nonce = "d".repeat(64);
  const code = "class Main {}";
  const room = {
    ...activeRoom(roomId, questionId),
    questions: [
      {
        _id: questionId,
        title: "Echo",
        points: 100,
        visibleTestCases: [{ input: "1", expectedOutput: "1" }],
        hiddenTestCases: [],
      },
    ],
  };
  const submission = {
    _id: submissionId,
    status: "PENDING",
    startTime: new Date(Date.now() - 1_000),
    questionResults: [
      {
        questionId,
        status: "PENDING",
        revision: 0,
        score: 0,
        passed: 0,
        failed: 0,
        code: "",
      },
    ],
  };
  const claimId = "claim-retry";
  let attempt = 0;
  let released = 0;
  let executed = 0;
  let persisted = 0;
  let persistenceCalls = 0;

  t.mock.method(BattleRoom, "findOne", () => ({ lean: async () => room }));
  t.mock.method(BattleRoomSubmission, "findOne", () => ({
    select() {
      return this;
    },
    lean: async () => submission,
  }));
  t.mock.method(Nonce, "claimDesktopSubmission", async () => {
    attempt += 1;
    return {
      nonce: { _id: new mongoose.Types.ObjectId(), state: "PROCESSING" },
      claimId,
      claimed: true,
    };
  });
  t.mock.method(Nonce, "releaseDesktopSubmission", async () => {
    released += 1;
    return { state: "RETRYABLE" };
  });
  t.mock.method(Nonce, "completeDesktopSubmission", async () => ({
    state: "COMPLETED",
  }));
  t.mock.method(executionService, "execute", async () => {
    executed += 1;
    if (executed === 1) {
      throw new Error("Engine connection timed out.");
    }
    return {
      status: "ACCEPTED",
      passed: 1,
      failed: 0,
      total: 1,
      results: [
        {
          testCase: 1,
          input: "1",
          status: "PASSED",
          output: "1",
          expectedOutput: "1",
        },
      ],
    };
  });
  t.mock.method(BattleRoomSubmission, "updateOne", async (_query, update) => {
    if (update.$set?.["questionResults.0"]) {
      persistenceCalls += 1;
      if (persistenceCalls === 1) {
        throw new Error("Mongo write timed out.");
      }
      persisted += 1;
    }
    return { matchedCount: 1 };
  });
  t.mock.method(BattleRoomSubmission, "findById", () => ({
    lean: async () => ({
      status: "COMPLETED",
      totalScore: 100,
      totalPassed: 1,
      totalFailed: 0,
      questionResults: [{ status: "ACCEPTED" }],
    }),
  }));

  const request = {
    params: { roomCode: "ABC234" },
    body: {
      questionId: questionId.toString(),
      code,
      desktopNonce: nonce,
    },
    userId,
  };
  const firstResponse = responseRecorder();
  await submitQuestionSolution(request, firstResponse);
  assert.equal(firstResponse.statusCode, 503);
  assert.equal(firstResponse.body.retryable, true);
  assert.equal(released, 1);
  assert.equal(persisted, 0);

  const persistenceFailureResponse = responseRecorder();
  await submitQuestionSolution(request, persistenceFailureResponse);
  assert.equal(persistenceFailureResponse.statusCode, 503);
  assert.equal(persistenceFailureResponse.body.retryable, true);
  assert.equal(released, 2);
  assert.equal(persisted, 0);

  const retryResponse = responseRecorder();
  await submitQuestionSolution(request, retryResponse);
  assert.equal(retryResponse.statusCode, 200);
  assert.equal(attempt, 3);
  assert.equal(executed, 3);
  assert.equal(persistenceCalls, 2);
  assert.equal(persisted, 1);
});

test("returns the persisted result when the same authorization is retried", async (t) => {
  const roomId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const submissionId = new mongoose.Types.ObjectId();
  const nonce = "e".repeat(64);
  const priorNonce = "f".repeat(64);
  const code = "class Main {}";
  const room = {
    ...activeRoom(roomId, questionId),
    endTime: new Date(Date.now() - 1_000),
    questions: [
      {
        _id: questionId,
        title: "Echo",
        points: 100,
        visibleTestCases: [{ input: "1", expectedOutput: "1" }],
        hiddenTestCases: [{ input: "hidden", expectedOutput: "hidden result" }],
      },
    ],
  };
  const persistedResult = {
    questionId,
    questionTitle: "Echo",
    executionGrantNonce: priorNonce,
    code,
    language: "java",
    status: "WRONG_ANSWER",
    score: 50,
    passed: 1,
    failed: 1,
    total: 2,
    results: [
      { status: "PASSED", output: "1", input: "1", expectedOutput: "1" },
      { status: "WRONG_ANSWER", isHidden: true },
    ],
  };
  const submission = {
    _id: submissionId,
    status: "COMPLETED",
    startTime: new Date(),
    totalScore: 50,
    totalPassed: 1,
    totalFailed: 1,
    questionResults: [{ ...persistedResult, executionGrantNonce: undefined }],
  };
  let executionCalled = false;
  let findOneCalls = 0;
  let grantCompleted = false;
  t.mock.method(BattleRoom, "findOne", () => ({ lean: async () => room }));
  t.mock.method(BattleRoomSubmission, "findOne", () => ({
    select() {
      return this;
    },
    lean: async () => {
      findOneCalls += 1;
      return findOneCalls === 1
        ? submission
        : {
            ...submission,
            questionResults: [persistedResult],
          };
    },
  }));
  t.mock.method(Nonce, "claimDesktopSubmission", async () => ({
    nonce: { _id: new mongoose.Types.ObjectId(), state: "PROCESSING" },
    claimId: "new-claim",
    claimed: true,
  }));
  t.mock.method(Nonce, "completeDesktopSubmission", async () => {
    grantCompleted = true;
    return { state: "COMPLETED" };
  });
  t.mock.method(executionService, "execute", async () => {
    executionCalled = true;
    throw new Error("Completed submissions must not be re-executed.");
  });

  const res = responseRecorder();
  await submitQuestionSolution(
    {
      params: { roomCode: "ABC234" },
      body: {
        questionId: questionId.toString(),
        code,
        desktopNonce: nonce,
      },
      userId,
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(grantCompleted, true);
  assert.equal(res.body.questionResult.score, 50);
  assert.equal(res.body.questionResult.hiddenPassed, 0);
  assert.equal(JSON.stringify(res.body).includes("hidden result"), false);
  assert.equal(executionCalled, false);
});

test("returns a saved web submission after the room ends if the client lost the response", async (t) => {
  const roomId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const code = "class Main {}";
  const room = {
    ...activeRoom(roomId, questionId),
    endTime: new Date(Date.now() - 1_000),
    questions: [
      {
        _id: questionId,
        title: "Echo",
        visibleTestCases: [{ input: "1", expectedOutput: "1" }],
        hiddenTestCases: [],
      },
    ],
  };
  const submission = {
    _id: new mongoose.Types.ObjectId(),
    status: "COMPLETED",
    totalScore: 100,
    totalPassed: 1,
    totalFailed: 0,
    questionResults: [
      {
        questionId,
        questionTitle: "Echo",
        code,
        language: "java",
        status: "ACCEPTED",
        score: 100,
        passed: 1,
        failed: 0,
        total: 1,
        results: [
          {
            testCase: 1,
            input: "1",
            status: "PASSED",
            output: "1",
            expectedOutput: "1",
            isHidden: false,
          },
        ],
      },
    ],
  };
  let executionCalled = false;
  t.mock.method(BattleRoom, "findOne", () => ({ lean: async () => room }));
  t.mock.method(BattleRoomSubmission, "findOne", () => ({
    lean: async () => submission,
  }));
  t.mock.method(executionService, "execute", async () => {
    executionCalled = true;
    throw new Error("A saved submission must not be re-executed.");
  });

  const res = responseRecorder();
  await submitQuestionSolution(
    {
      params: { roomCode: "ABC234" },
      body: { questionId: questionId.toString(), code, language: "java" },
      userId,
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.questionResult.status, "ACCEPTED");
  assert.equal(res.body.questionResult.score, 100);
  assert.equal(executionCalled, false);
});
