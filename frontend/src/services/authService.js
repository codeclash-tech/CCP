import api from "./api";

const ACCESS_TOKEN_KEY = "ccp_access_token";
const REFRESH_TOKEN_KEY = "ccp_refresh_token";
const SESSION_ID_KEY = "ccp_session_id";

function saveSession(result) {
  if (!result?.token || !result.user) {
    throw new Error("The sign-in response did not include a valid session.");
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, result.token);
  if (result.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  if (result.sessionId) {
    localStorage.setItem(SESSION_ID_KEY, result.sessionId);
  } else {
    localStorage.removeItem(SESSION_ID_KEY);
  }
  return result.user;
}

function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
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
    clearSession();
  }
};
