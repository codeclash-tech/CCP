import api from "./api";
import { clearAuthTokens, storeAuthTokens } from "./sessionCredentials";

const SESSION_ID_KEY = "ccp_session_id";

async function saveSession(result) {
  if (!result?.token || !result.user) {
    throw new Error("The sign-in response did not include a valid session.");
  }
  await storeAuthTokens(result.token, result.refreshToken || null);
  if (result.sessionId) {
    localStorage.setItem(SESSION_ID_KEY, result.sessionId);
  } else {
    localStorage.removeItem(SESSION_ID_KEY);
  }
  return result.user;
}

async function clearSession() {
  await clearAuthTokens();
  localStorage.removeItem(SESSION_ID_KEY);
}

export const requestRegistrationOtp = (details) =>
  api.post("/auth/request-otp", details).then((response) => response.data);

export const verifyRegistrationOtp = ({ userId, otp }) =>
  api
    .post("/auth/verify-otp", { userId, otp })
    .then((response) => saveSession(response.data));

export const loginWithPassword = (credentials) =>
  api
    .post("/auth/login-password", credentials)
    .then((response) => saveSession(response.data));

export const requestPasswordReset = (email) =>
  api
    .post("/auth/request-password-reset", { email })
    .then((response) => response.data);

export const resetPassword = (details) =>
  api.post("/auth/reset-password", details).then((response) => response.data);

export const getProfile = () =>
  api.get("/auth/profile").then((response) => response.data.user);

export const updateProfile = (profile) =>
  api.put("/auth/profile", profile).then((response) => response.data.user);

export const signOut = async () => {
  try {
    await api.post("/auth/logout", {
      sessionId: localStorage.getItem(SESSION_ID_KEY),
    });
  } finally {
    await clearSession();
  }
};
