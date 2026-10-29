import { lazy, Suspense, useEffect, useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";

import Navbar from "../components/layout/Navbar";
import DesktopTitleBar from "../components/layout/DesktopTitleBar";
import Footer from "../components/layout/Footer";
import RoleNavigation from "../components/layout/RoleNavigation";
import { useAuth } from "../context/AuthContext";
import {
  ASSESSMENT_ROLES,
  canAccessRoute,
  getAssessmentRole,
  hasAnyAssessmentRole,
} from "./roleAccess";

const Home = lazy(() => import("../pages/Home"));
const BattleRoom = lazy(() => import("../pages/BattleRoom"));
const CreateBattleRoom = lazy(() => import("../pages/CreateBattleRoom"));
const RoomParticipants = lazy(() => import("../pages/RoomParticipants"));
const AdminQuestions = lazy(() => import("../pages/AdminQuestions"));
const BattleRoomChallenge = lazy(() => import("../pages/BattleRoomChallenge"));
const BattleRoomLeaderboard = lazy(
  () => import("../pages/BattleRoomLeaderboard"),
);
const AuthPage = lazy(() => import("../pages/AuthPage"));
const Profile = lazy(() => import("../pages/Profile"));
const WeeklyAssessment = lazy(() => import("../pages/WeeklyAssessment"));
const GlobalChallengeAdmin = lazy(() => import("../pages/GlobalChallengeAdmin"));
const WeeklyRankings = lazy(() => import("../pages/WeeklyRankings"));
const About = lazy(() => import("../pages/About"));
const Terms = lazy(() => import("../pages/Terms"));
const PublicLanding = lazy(() => import("../pages/PublicLanding"));

function AppLayout({ children }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== "undefined" && Boolean(document.fullscreenElement),
  );
  const { user } = useAuth();
  const isDesktop =
    typeof window !== "undefined" && Boolean(window.codeClashDesktop);
  const closeNavigation = () => setNavigationOpen(false);

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
    };
  }, []);

  return (
    <div
      className={`app-shell${isDesktop ? " desktop-app-shell" : ""}${isFullscreen ? " fullscreen-app-shell" : ""}`}
    >
      {isDesktop && !isFullscreen && <DesktopTitleBar />}
      {!isFullscreen && !isDesktop && (
        <Navbar
          navigationOpen={navigationOpen}
          onToggleNavigation={() => setNavigationOpen((open) => !open)}
        />
      )}
      <div
        className={`app-shell-body${isDesktop && !user ? " desktop-app-shell-unauthenticated" : ""}`}
      >
        {!isFullscreen && user && (
          <RoleNavigation
            open={navigationOpen}
            onNavigate={closeNavigation}
            desktop={isDesktop}
          />
        )}
        <main className="app-shell-content">
          <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
        </main>
      </div>
      {!isFullscreen && !isDesktop && <Footer />}
    </div>
  );
}

function ProtectedLayout({ children, allowedRoles, fullScreen = false }) {
  const { user, isAuthenticated, loading, sessionError } = useAuth();
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
  if (
    !canAccessRoute(user, location.pathname) ||
    (allowedRoles && !hasAnyAssessmentRole(user, allowedRoles))
  ) {
    return (
      <AppLayout>
        <AccessDeniedPage />
      </AppLayout>
    );
  }
  return fullScreen ? (
    <div style={{ minHeight: "100vh", background: "var(--bg-main)" }}>
      <Suspense fallback={<RouteSkeleton fullScreen />}>{children}</Suspense>
    </div>
  ) : (
    <AppLayout>{children}</AppLayout>
  );
}

function AccessDeniedPage() {
  return (
    <section className="development-route-page" role="alert">
      <h1>Access denied</h1>
      <p>
        This section is available only to the authorized CodeClash role for
        this account.
      </p>
    </section>
  );
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
      <AppLayout>
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
      </AppLayout>
    );
  }
  if (isAuthenticated) return <Navigate to="/" replace />;
  return (
    <AppLayout>
      <Suspense fallback={<AuthRouteSkeleton />}>
        <AuthPage mode={mode} />
      </Suspense>
    </AppLayout>
  );
}

function DashboardRoute() {
  const { user } = useAuth();
  if (getAssessmentRole(user) === ASSESSMENT_ROLES.SUPER_ADMIN) {
    return <Navigate to="/admin" replace />;
  }
  return <Home />;
}

function AuthRouteSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading sign-in form"
      aria-busy="true"
      className="auth-route-skeleton"
    >
      <div className="auth-route-skeleton-card">
        <div className="loading-skeleton loading-skeleton-mark" />
        <div className="loading-skeleton loading-skeleton-title" />
        <div className="loading-skeleton loading-skeleton-copy" />
        <div className="loading-skeleton loading-skeleton-field" />
        <div className="loading-skeleton loading-skeleton-field" />
        <div className="loading-skeleton loading-skeleton-submit" />
      </div>
    </div>
  );
}

function RouteSkeleton({ fullScreen = false }) {
  return (
    <div
      role="status"
      aria-label="Loading page content"
      aria-busy="true"
      className={`route-skeleton${fullScreen ? " route-skeleton-fullscreen" : ""}`}
    >
      <div className="route-skeleton-content">
        <div className="loading-skeleton route-skeleton-heading" />
        <div className="route-skeleton-cards">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="loading-skeleton route-skeleton-card" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AppRouter() {
  if (typeof window === "undefined" || !window.codeClashDesktop) {
    return (
      <Suspense fallback={<RouteSkeleton />}>
        <PublicLanding />
      </Suspense>
    );
  }

  const Router = HashRouter;

  return (
    <Router>
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
                <DashboardRoute />
              </ProtectedLayout>
            }
          />
          <Route path="/assessments" element={<Navigate to="/battle-room" replace />} />
          <Route path="/daily-assessment" element={<Navigate to="/weekly-assessment" replace />} />
          <Route
            path="/weekly-assessment"
            element={
              <ProtectedLayout>
                <WeeklyAssessment />
              </ProtectedLayout>
            }
          />
          <Route
            path="/rankings"
            element={
              <ProtectedLayout>
                <WeeklyRankings />
              </ProtectedLayout>
            }
          />
          <Route path="/certificates" element={<Navigate to="/rankings" replace />} />
          <Route
            path="/settings"
            element={<Navigate to="/" replace />}
          />
          <Route
            path="/assessments/edit"
            element={
              <ProtectedLayout
                allowedRoles={[
                  ASSESSMENT_ROLES.ORGANIZATION_USER,
                  ASSESSMENT_ROLES.SUPER_ADMIN,
                ]}
              >
                <Navigate
                  to="/battle-room"
                  replace
                  state={{ activeTab: "my-rooms" }}
                />
              </ProtectedLayout>
            }
          />
          <Route
            path="/participants"
            element={
              <ProtectedLayout
                allowedRoles={[
                  ASSESSMENT_ROLES.ORGANIZATION_USER,
                  ASSESSMENT_ROLES.SUPER_ADMIN,
                ]}
              >
                <Navigate
                  to="/battle-room"
                  replace
                  state={{ activeTab: "my-rooms" }}
                />
              </ProtectedLayout>
            }
          />
          <Route path="/results" element={<Navigate to="/rankings" replace />} />
          <Route
            path="/admin"
            element={
              <ProtectedLayout
                allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}
              >
                <GlobalChallengeAdmin />
              </ProtectedLayout>
            }
          />
          <Route
            path="/admin/weekly-assessment"
            element={
              <ProtectedLayout
                allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}
              >
                <GlobalChallengeAdmin />
              </ProtectedLayout>
            }
          />
          <Route
            path="/admin/rankings"
            element={
              <ProtectedLayout
                allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}
              >
                <GlobalChallengeAdmin view="rankings" />
              </ProtectedLayout>
            }
          />
          <Route
            path="/admin/questions"
            element={
              <ProtectedLayout
                allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}
              >
                <AdminQuestions />
              </ProtectedLayout>
            }
          />
          <Route path="/admin/weekly-roster" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/participants" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/rankings/individual" element={<Navigate to="/admin/rankings" replace />} />
          <Route path="/admin/rankings/organizations" element={<Navigate to="/admin/rankings" replace />} />
          <Route path="/admin/weekly-history" element={<Navigate to="/admin/rankings" replace />} />
          <Route path="/admin/certificates" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/assessments" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/organizations-users" element={<Navigate to="/admin" replace />} />
          <Route
            path="/admin/settings"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/*"
            element={
              <ProtectedLayout
                allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}
              >
                <AccessDeniedPage />
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
            path="/battle-room/:roomCode/edit"
            element={
              <ProtectedLayout>
                <CreateBattleRoom />
              </ProtectedLayout>
            }
          />
          <Route
            path="/battle-room/:roomCode/participants"
            element={
              <ProtectedLayout>
                <RoomParticipants />
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
    </Router>
  );
}
