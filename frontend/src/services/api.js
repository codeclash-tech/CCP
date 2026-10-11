import axios from "axios";
import { API_BASE_URL } from "../utils/constants";
import {
  currentExecutionTraceId,
  recordExecutionRequestStart,
  recordExecutionResponseBody,
  recordExecutionResponseHeaders,
} from "../utils/executionPerformance";

const ACCESS_TOKEN_KEY = "ccp_access_token";
const REFRESH_TOKEN_KEY = "ccp_refresh_token";
const SESSION_ID_KEY = "ccp_session_id";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

if (
  import.meta.env.VITE_BATTLE_ROOM_PERF_LOGS === "true" &&
  typeof XMLHttpRequest !== "undefined"
) {
  const prototype = XMLHttpRequest.prototype;
  if (!prototype.__ccpExecutionPerfWrapped) {
    const open = prototype.open;
    const setRequestHeader = prototype.setRequestHeader;
    const send = prototype.send;

    prototype.open = function instrumentExecutionOpen(...args) {
      const url = String(args[1] || "");
      const matchesExecutionRequest =
        /\/battle-rooms\/[^/?]+\/(?:run|submit)(?:[?#]|$)/i.test(url);
      this.__ccpExecutionPerf = matchesExecutionRequest
        ? { traceId: currentExecutionTraceId(), url, requestId: null }
        : null;
      return open.apply(this, args);
    };

    prototype.setRequestHeader = function instrumentExecutionHeader(name, value) {
      if (
        this.__ccpExecutionPerf &&
        String(name).toLowerCase() === "x-request-id"
      ) {
        this.__ccpExecutionPerf.requestId = String(value);
      }
      return setRequestHeader.call(this, name, value);
    };

    prototype.send = function instrumentExecutionSend(...args) {
      const metadata = this.__ccpExecutionPerf;
      if (metadata?.traceId) {
        const attempt = recordExecutionRequestStart(
          metadata.traceId,
          metadata.requestId,
        );
        let headersRecorded = false;
        this.addEventListener("readystatechange", () => {
          if (this.readyState === XMLHttpRequest.HEADERS_RECEIVED && !headersRecorded) {
            headersRecorded = true;
            recordExecutionResponseHeaders(
              metadata.traceId,
              attempt,
              this.status,
            );
          }
        });
        this.addEventListener("loadend", () => {
          recordExecutionResponseBody(metadata.traceId, attempt, this.status);
        });
      }
      return send.apply(this, args);
    };

    Object.defineProperty(prototype, "__ccpExecutionPerfWrapped", {
      value: true,
    });
  }
}

let refreshRequest;

function clearStoredSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(SESSION_ID_KEY);
  window.dispatchEvent(new Event("ccp-auth-expired"));
}

function canRefreshRequest(config) {
  const url = String(config?.url || "");
  if (url.includes("/auth/")) {
    return /\/auth\/(profile|logout|sessions)(?:\?|$)/.test(url);
  }
  return true;
}

function getApiErrorMessage(error) {
  if (error.response) {
    const { status, data } = error.response;
    if (status === 401) {
      return data?.error || "Your session has expired. Please sign in again.";
    }
    if (status === 403) return data?.error || "Access forbidden.";
    if (status === 404) return data?.error || "Resource not found.";
    if (status === 429) {
      return (
        data?.error || "Too many requests. Please wait a moment and try again."
      );
    }
    if ([500, 502, 503].includes(status)) {
      return (
        data?.error || "Server error. Please try again in a few moments."
      );
    }
    return data?.error || data?.message || "An error occurred";
  }

  if (["ECONNABORTED", "ETIMEDOUT"].includes(error.code)) {
    return "Request timed out. Please try again.";
  }
  if (error.code === "ERR_NETWORK" || error.isAxiosError) {
    return "Network error. Please check your connection.";
  }
  return error.message || "An unexpected error occurred. Please try again.";
}

function refreshAccessToken() {
  if (!refreshRequest) {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      clearStoredSession();
      return Promise.reject(new Error("No refresh token is available."));
    }

    refreshRequest = axios
      .post(
        `${API_BASE_URL}/auth/refresh-token`,
        { refreshToken },
        { timeout: 120000, withCredentials: true },
      )
      .then(({ data }) => {
        if (!data?.token || !data?.refreshToken) {
          throw new Error("The session refresh response was incomplete.");
        }

        localStorage.setItem(ACCESS_TOKEN_KEY, data.token);
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
        if (data.sessionId) {
          localStorage.setItem(SESSION_ID_KEY, data.sessionId);
        }
        return data.token;
      })
      .catch((error) => {
        if ([400, 401].includes(error.response?.status)) {
          clearStoredSession();
        }
        throw new Error(getApiErrorMessage(error));
      })
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
}

api.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    config.headers["X-Request-Id"] =
      `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response) {
      const { status } = error.response;

      if (
        status === 401 &&
        error.config &&
        !error.config._retry &&
        canRefreshRequest(error.config)
      ) {
        error.config._retry = true;
        try {
          const accessToken = await refreshAccessToken();
          error.config.headers.Authorization = `Bearer ${accessToken}`;
          return api(error.config);
        } catch (refreshError) {
          return Promise.reject(refreshError);
        }
      }

      if (
        status === 401 &&
        (error.config?._retry ||
          !String(error.config?.url || "").includes("/auth/"))
      ) {
        clearStoredSession();
      }

      return Promise.reject(new Error(getApiErrorMessage(error)));
    }
    return Promise.reject(new Error(getApiErrorMessage(error)));
  },
);

export default api;
