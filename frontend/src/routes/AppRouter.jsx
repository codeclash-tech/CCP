import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";

import Home from "../pages/Home";
import BattleRoom from "../pages/BattleRoom";
import CreateBattleRoom from "../pages/CreateBattleRoom";
import BattleRoomChallenge from "../pages/BattleRoomChallenge";
import BattleRoomLeaderboard from "../pages/BattleRoomLeaderboard";
import AuthPage from "../pages/AuthPage";
import Profile from "../pages/Profile";
import About from "../pages/About";
import Terms from "../pages/Terms";

import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import {
  LoadingScreen,
  SessionErrorScreen,
} from "../components/layout/SessionState";
import { useAuth } from "../context/AuthContext";

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
      <main style={{ flex: 1, padding: "0" }}>{children}</main>
      <Footer />
    </div>
  );
}

function ProtectedLayout({ children }) {
  const { isAuthenticated, loading, sessionError, refreshProfile } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen message="Checking your session..." />;
  if (sessionError) {
    return (
      <SessionErrorScreen message={sessionError} onRetry={refreshProfile} />
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
  const { isAuthenticated, loading, sessionError, refreshProfile } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen message="Checking your session..." />;
  if (sessionError) {
    return (
      <SessionErrorScreen message={sessionError} onRetry={refreshProfile} />
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
      {children}
    </div>
  );
}

function UnauthenticatedOnlyPage({ mode }) {
  const { isAuthenticated, loading, sessionError, refreshProfile } = useAuth();
  if (loading) {
    return <LoadingScreen message="Checking your session..." />;
  }
  if (sessionError) {
    return (
      <SessionErrorScreen message={sessionError} onRetry={refreshProfile} />
    );
  }
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <AuthPage mode={mode} />;
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
