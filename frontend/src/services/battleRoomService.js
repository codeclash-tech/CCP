import api, { getFreshAccessTokenForDesktopSubmission } from "./api";
import {
  executeVisibleCasesLocally,
  submitQuestionLocally,
} from "./localExecutionService";
import { generateReferenceOutputs } from "./referenceOutputService";
import { API_BASE_URL } from "../utils/constants";

export const generateStarterCode = (
  functionSignature,
  starterCodeByLanguage,
  language,
  signature,
) => {
  return api
    .post("/battle-rooms/authoring/generate-starter", {
      functionSignature,
      signature,
      starterCodeByLanguage,
      language,
    })
    .then((res) => res.data);
};

export const generateExpectedOutputs = (question) => {
  const desktopBridge =
    typeof window !== "undefined" ? window.codeClashDesktop : undefined;
  return generateReferenceOutputs(
    question,
    desktopBridge,
    (payload) =>
      api
        .post("/battle-rooms/authoring/generate-outputs", { question: payload })
        .then((res) => res.data),
  );
};

export const validateQuestion = (question) => {
  return api
    .post("/battle-rooms/authoring/validate", { question })
    .then((res) => res.data);
};

/**
 * Generate canonical signature + language previews from structured input.
 * @param {string} name  - function name
 * @param {string} returnType - canonical return type
 * @param {Array<{name: string, type: string}>} parameters
 * @returns {Promise<{signature: Object, signaturePreview: Object, functionName: string, returnType: string, parameters: Array}>}
 */
export const generateSignature = (name, returnType, parameters) => {
  return api
    .post("/battle-rooms/authoring/generate-signature", {
      name,
      returnType,
      parameters,
    })
    .then((res) => res.data);
};

/**
 * Create a battle room (existing endpoint, unchanged).
 */
export const createRoom = (roomData) =>
  api.post("/battle-rooms/create", roomData).then((r) => r.data);

export const getRoomForEdit = (roomCode) =>
  api.get(`/battle-rooms/${roomCode}/edit`).then((r) => r.data);

export const updateRoom = (roomCode, roomData) =>
  api.put(`/battle-rooms/${roomCode}`, roomData).then((r) => r.data);

export const getRoomParticipants = (roomCode) =>
  api.get(`/battle-rooms/${roomCode}/participants`).then((r) => r.data);

export const updateRoomAllowlist = (roomCode, accessData) =>
  api.put(`/battle-rooms/${roomCode}/allowlist`, accessData).then((r) => r.data);

export const startRoom = (roomCode) =>
  api.post(`/battle-rooms/${roomCode}/start`).then((r) => r.data);

export const getRoomByCode = (roomCode) =>
  api.get(`/battle-rooms/${roomCode}`).then((r) => r.data);

export const joinRoom = (roomCode) =>
  api.post("/battle-rooms/join", { roomCode }).then((r) => r.data);

// Stateless code execution paths. The engine on Render can be slow on cold starts,
// so these use a longer per-request timeout (120s) rather than the default 30s.
const EXECUTION_TIMEOUT = 120000;

export const submitSolution = async ({
  roomCode,
  questionId,
  code,
  language,
  question,
}) => {
  if (typeof window !== "undefined" && window.codeClashDesktop) {
    const accessToken = await getFreshAccessTokenForDesktopSubmission();
    return submitQuestionLocally({
      apiBaseUrl: API_BASE_URL,
      accessToken,
      roomCode,
      questionId,
      question,
      code,
      language,
    });
  }

  return api
    .post(
      `/battle-rooms/${roomCode}/submit`,
      { questionId, code, language },
      { timeout: EXECUTION_TIMEOUT },
    )
    .then((r) => r.data);
};

export const runSolution = ({ roomCode, questionId, code, language, question }) => {
  if (
    typeof window !== "undefined" &&
    typeof window.codeClashDesktop?.engine?.execute === "function"
  ) {
    return executeVisibleCasesLocally({ question, code, language });
  }

  return api
    .post(
      `/battle-rooms/${roomCode}/run`,
      { questionId, code, language },
      { timeout: EXECUTION_TIMEOUT },
    )
    .then((r) => r.data);
};

export const getRoomLeaderboard = (roomCode) =>
  api.get(`/battle-rooms/${roomCode}/leaderboard`).then((r) => r.data);

export const downloadRoomResultsExcel = (roomCode) =>
  api
    .get(`/battle-rooms/${roomCode}/report/excel`, { responseType: "blob" })
    .then((r) => r.data);

export const getUserResult = (roomCode) =>
  api.get(`/battle-rooms/${roomCode}/my-result`).then((r) => r.data);

export const downloadBattleRoomCertificate = (roomCode) =>
  api
    .get(`/battle-rooms/${roomCode}/certificate`, { responseType: "blob" })
    .then((r) => r.data);

export const closeRoom = (roomCode) =>
  api.post(`/battle-rooms/${roomCode}/close`).then((r) => r.data);

export const getRoomResultDelivery = (roomCode) =>
  api.get(`/battle-rooms/${roomCode}/result-delivery`).then((r) => r.data);

export const retryRoomResultDelivery = (roomCode) =>
  api
    .post(`/battle-rooms/${roomCode}/result-delivery/retry`)
    .then((r) => r.data);

export const deleteRoom = (roomCode) =>
  api.delete(`/battle-rooms/${roomCode}`).then((r) => r.data);

export const shareKey = (roomCode) =>
  api.post(`/battle-rooms/${roomCode}/share-key`).then((r) => r.data);

export const getMyRooms = () =>
  api.get("/battle-rooms/my-rooms").then((r) => r.data);

export const getJoinedRooms = () =>
  api.get("/battle-rooms/joined-rooms").then((r) => r.data);

export const disqualifySubmission = (roomCode, data) =>
  api.post(`/battle-rooms/${roomCode}/disqualify`, data).then((r) => r.data);

export const endTest = (roomCode) =>
  api
    .post(`/battle-rooms/${roomCode}/end`, {}, { timeout: EXECUTION_TIMEOUT })
    .then((r) => r.data);

export { disqualifySubmission as disqualifyRoomSubmission };
