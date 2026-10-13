import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";

import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import { useAuth } from "../context/AuthContext";

const Home = lazy(() => import("../pages/Home"));
const BattleRoom = lazy(() => import("../pages/BattleRoom"));
const CreateBattleRoom = lazy(() => import("../pages/CreateBattleRoom"));
const BattleRoomChallenge = lazy(() => import("../pages/BattleRoomChallenge"));
const BattleRoomLeaderboard = lazy(
  () => import("../pages/BattleRoomLeaderboard"),
);
const AuthPage = lazy(() => import("../pages/AuthPage"));
const Profile = lazy(() => import("../pages/Profile"));
const About = lazy(() => import("../pages/About"));
const Terms = lazy(() => import("../pages/Terms"));

function AppLayout({ children }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--bg-main)",
      }}
    >
      <Navbar />
      <main style={{ flex: 1, padding: "0" }}>
        <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
      </main>
      <Footer />
    </div>
  );
}

function ProtectedLayout({ children }) {
  const { isAuthenticated, loading, sessionError } = useAuth();
  const location = useLocation();
  if (loading && !isAuthenticated) {
    return (
      <AppLayout>
        <RouteSkeleton />
      </AppLayout>
    );
  }
  if (sessionError && !isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <AppLayout>{children}</AppLayout>;
}

// Full-screen layout for the challenge assessment: no navbar, no footer.
function FullScreenProtectedLayout({ children }) {
  const { isAuthenticated, loading, sessionError } = useAuth();
  const location = useLocation();
  if (loading && !isAuthenticated) return <RouteSkeleton fullScreen />;
  if (sessionError && !isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-main)" }}>
      <Suspense fallback={<RouteSkeleton fullScreen />}>{children}</Suspense>
    </div>
  );
}

function UnauthenticatedOnlyPage({ mode }) {
  const { isAuthenticated, sessionError, refreshProfile } = useAuth();
  if (sessionError && !isAuthenticated) {
    return (
      <>
        <div
          role="status"
          style={{
            padding: "10px 16px",
            color: "var(--text-muted)",
            background: "var(--bg-elevated)",
            textAlign: "center",
            fontSize: 13,
          }}
        >
          Your saved session could not be verified. You can still sign in.
          <button
            type="button"
            className="btn-secondary"
            onClick={refreshProfile}
            style={{ marginLeft: 10, padding: "4px 8px", fontSize: 12 }}
          >
            Retry
          </button>
        </div>
        <Suspense fallback={<AuthRouteSkeleton />}>
          <AuthPage mode={mode} />
        </Suspense>
      </>
    );
  }
  if (isAuthenticated) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<AuthRouteSkeleton />}>
      <AuthPage mode={mode} />
    </Suspense>
  );
}

function AuthRouteSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading sign-in form"
      aria-busy="true"
      style={{
        minHeight: "calc(100vh - 112px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--bg-main)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "min(100%, 440px)",
          height: 390,
          borderRadius: 12,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-color)",
        }}
      />
    </div>
  );
}

function RouteSkeleton({ fullScreen = false }) {
  return (
    <div
      role="status"
      aria-label="Loading page content"
      aria-busy="true"
      style={{
        minHeight: fullScreen ? "100vh" : "calc(100vh - 112px)",
        padding: fullScreen ? 24 : "clamp(20px, 4vw, 64px)",
        background: "var(--bg-main)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gap: 20,
        }}
      >
        <div
          style={{
            height: fullScreen ? 74 : 150,
            borderRadius: 14,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-color)",
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              style={{
                height: fullScreen ? 220 : 180,
                borderRadius: 12,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-color)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={<UnauthenticatedOnlyPage mode="login" />}
          />
          <Route
            path="/register"
            element={<UnauthenticatedOnlyPage mode="register" />}
          />
          <Route
            path="/about"
            element={
              <AppLayout>
                <About />
              </AppLayout>
            }
          />
          <Route
            path="/terms"
            element={
              <AppLayout>
                <Terms />
              </AppLayout>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedLayout>
                <Home />
              </ProtectedLayout>
            }
          />
          <Route
            path="/battle-room"
            element={
              <ProtectedLayout>
                <BattleRoom />
              </ProtectedLayout>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedLayout>
                <Profile />
              </ProtectedLayout>
            }
          />
          <Route
            path="/battle-room/create"
            element={
              <ProtectedLayout>
                <CreateBattleRoom />
              </ProtectedLayout>
            }
          />
          <Route
            path="/battle-room/:roomCode/challenge"
            element={
              <FullScreenProtectedLayout>
                <BattleRoomChallenge />
              </FullScreenProtectedLayout>
            }
          />
          <Route
            path="/battle-room/:roomCode/leaderboard"
            element={
              <ProtectedLayout>
                <BattleRoomLeaderboard />
              </ProtectedLayout>
            }
          />
          <Route
            path="/battle-room/:roomCode"
            element={
              <FullScreenProtectedLayout>
                <BattleRoomChallenge />
              </FullScreenProtectedLayout>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
