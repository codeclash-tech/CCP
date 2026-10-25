import api from "./api";

export async function submitSolution(challengeId, code, language, timeToSolve) {
  const response = await api.post("/submissions", {
    challengeId,
    code,
    language,
    timeToSolve,
  });
  return response.data;
}

export async function runSolution(challengeId, code, language) {
  const response = await api.post("/execute/run", {
    challengeId,
    code,
    language,
  });
  return response.data;
}

// Execute the user's code against every test case and score it.
// This is the single final submission that produces the challenge score.
export async function executeAndSubmit(
  challengeId,
  code,
  language,
  timeToSolve,
) {
  // Fetch a fresh nonce for replay protection.
  const nonceRes = await api.get(`/execute/nonce?action=SUBMIT`);
  const nonce = nonceRes.data?.nonce;

  const response = await api.post(
    "/execute/submit",
    {
      challengeId,
      code,
      language,
      timeToSolve,
    },
    {
      headers: {
        "X-Nonce": nonce,
        "X-Nonce-Action": "SUBMIT",
      },
    },
  );
  return response.data;
}

export async function getSubmissionResult(challengeId) {
  const response = await api.get(`/submissions/${challengeId}`);
  return response.data;
}

export async function getSubmissionHistory(page = 1, limit = 20) {
  const response = await api.get(
    `/submissions/history?page=${page}&limit=${limit}`,
  );
  return response.data;
}

export async function mockExecutionResult(submissionId, totalCases = 7) {
  const response = await api.post(`/execute/mock/${submissionId}`, {
    totalCases,
  });
  return response.data;
}
