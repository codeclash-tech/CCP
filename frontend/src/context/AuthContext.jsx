import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getProfile, signOut as signOutRequest } from "../services/authService";

const AuthContext = createContext(null);
const AUTH_EVENT_KEY = "ccp-auth-event";
const ACCESS_TOKEN_KEY = "ccp_access_token";
const REFRESH_TOKEN_KEY = "ccp_refresh_token";
const CACHED_PROFILE_KEY = "ccp_cached_profile";

function clearPrivateClientState() {
  localStorage.removeItem("ccp_access_token");
  localStorage.removeItem("ccp_refresh_token");
  localStorage.removeItem("ccp_session_id");
  localStorage.removeItem("ccp_guest_id");
  localStorage.removeItem("ccp_guest_name");
  localStorage.removeItem("ccp_creator_credential");
  sessionStorage.removeItem(CACHED_PROFILE_KEY);
  for (const key of Object.keys(sessionStorage)) {
    if (
      key.startsWith("battle-room-editor:") ||
      key.startsWith("ccp:my-rooms:") ||
      key.startsWith("ccp:joined-rooms:") ||
      key.startsWith("ccp:leaderboard:")
    ) {
      sessionStorage.removeItem(key);
    }
  }
}

function readCachedProfile() {
  if (
    !localStorage.getItem(ACCESS_TOKEN_KEY) &&
    !localStorage.getItem(REFRESH_TOKEN_KEY)
  ) {
    return null;
  }
  try {
    const profile = JSON.parse(sessionStorage.getItem(CACHED_PROFILE_KEY) || "null");
    return profile && typeof profile === "object" ? profile : null;
  } catch {
    sessionStorage.removeItem(CACHED_PROFILE_KEY);
    return null;
  }
}

function cacheProfile(profile) {
  if (profile) {
    try {
      sessionStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(profile));
    } catch (error) {
      console.warn("Unable to cache the signed-in profile:", error.message);
    }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readCachedProfile);
  const [loading, setLoading] = useState(
    () =>
      Boolean(
        localStorage.getItem(ACCESS_TOKEN_KEY) ||
          localStorage.getItem(REFRESH_TOKEN_KEY),
      ),
  );
  const [sessionError, setSessionError] = useState("");
  const userRef = useRef(user);
  userRef.current = user;
  const profileRequestRef = useRef(null);

  const refreshProfile = useCallback(async () => {
    if (profileRequestRef.current) return profileRequestRef.current;
    setLoading(true);
    setSessionError("");
    const request = (async () => {
      try {
        const profile = await getProfile();
        setUser(profile);
        cacheProfile(profile);
        return profile;
      } catch (error) {
        const hasSession =
          localStorage.getItem(ACCESS_TOKEN_KEY) ||
          localStorage.getItem(REFRESH_TOKEN_KEY);
        if (!hasSession) {
          setUser(null);
        }
        if (hasSession && !userRef.current) {
          setSessionError(
            error.message || "Unable to verify your session. Please try again.",
          );
        }
        return null;
      } finally {
        setLoading(false);
        profileRequestRef.current = null;
      }
    })();
    profileRequestRef.current = request;
    return request;
  }, []);

  const signOut = useCallback(async ({ notifyOtherTabs = true } = {}) => {
    try {
      await signOutRequest();
    } finally {
      setUser(null);
      setSessionError("");
      clearPrivateClientState();
      if (notifyOtherTabs) {
        localStorage.setItem(AUTH_EVENT_KEY, String(Date.now()));
      }
    }
  }, []);

  useEffect(() => {
    if (
      !localStorage.getItem(ACCESS_TOKEN_KEY) &&
      !localStorage.getItem(REFRESH_TOKEN_KEY)
    ) {
      setLoading(false);
      return;
    }
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    const expireCurrentAuth = () => {
      setUser(null);
      setSessionError("");
      clearPrivateClientState();
    };
    const handleStorage = (event) => {
      if (event.key === AUTH_EVENT_KEY) {
        expireCurrentAuth();
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("ccp-auth-expired", expireCurrentAuth);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("ccp-auth-expired", expireCurrentAuth);
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      sessionError,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "ADMIN",
      refreshProfile,
      signIn: (profile) => {
        setSessionError("");
        setUser(profile);
        cacheProfile(profile);
      },
      updateUser: (profile) => {
        setUser(profile);
        cacheProfile(profile);
      },
      signOut,
    }),
    [user, loading, sessionError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

export default AuthContext;
