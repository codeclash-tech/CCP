import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getProfile, signOut as signOutRequest } from "../services/authService";

const AuthContext = createContext(null);
const AUTH_EVENT_KEY = "ccp-auth-event";
const ACCESS_TOKEN_KEY = "ccp_access_token";
const REFRESH_TOKEN_KEY = "ccp_refresh_token";

function clearPrivateClientState() {
  localStorage.removeItem("ccp_access_token");
  localStorage.removeItem("ccp_refresh_token");
  localStorage.removeItem("ccp_session_id");
  localStorage.removeItem("ccp_guest_id");
  localStorage.removeItem("ccp_guest_name");
  localStorage.removeItem("ccp_creator_credential");
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("battle-room-editor:")) sessionStorage.removeItem(key);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");

  const refreshProfile = useCallback(async () => {
    setLoading(true);
    setSessionError("");
    try {
      const profile = await getProfile();
      setUser(profile);
      return profile;
    } catch (error) {
      setUser(null);
      if (
        localStorage.getItem(ACCESS_TOKEN_KEY) ||
        localStorage.getItem(REFRESH_TOKEN_KEY)
      ) {
        setSessionError(
          error.message || "Unable to verify your session. Please try again.",
        );
      }
      return null;
    } finally {
      setLoading(false);
    }
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
      },
      updateUser: (profile) => {
        setUser(profile);
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
