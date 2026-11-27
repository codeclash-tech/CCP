import { lazy, Suspense, useEffect, useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  Link,
} from "react-router-dom";
import { ArrowUpRight, Monitor, ShieldCheck } from "lucide-react";
import { AuthProvider } from "../context/AuthContext";
import {
  DOWNLOAD_URL,
  isDesktopRuntime,
  isMobileDevice,
} from "../utils/desktopDownload";
import desktopPackage from "../../../desktop/package.json";

import Navbar from "../components/layout/Navbar";
import DesktopTitleBar from "../components/layout/DesktopTitleBar";
import RoleNavigation from "../components/layout/RoleNavigation";
import Footer from "../components/layout/Footer";
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
const BattleRoomChallenge = lazy(() => import("../pages/BattleRoomChallenge"));
const BattleRoomLeaderboard = lazy(
  () => import("../pages/BattleRoomLeaderboard"),
);
const AuthPage = lazy(() => import("../pages/AuthPage"));
const Profile = lazy(() => import("../pages/Profile"));
const WeeklyAssessment = lazy(() => import("../pages/WeeklyAssessment"));
const GlobalChallengeAdmin = lazy(
  () => import("../pages/GlobalChallengeAdmin"),
);
const LearningCenter = lazy(() => import("../pages/LearningCenter"));
const About = lazy(() => import("../pages/About"));
const Terms = lazy(() => import("../pages/Terms"));
const PublicLanding = lazy(() => import("../pages/PublicLanding"));
const InstallDesktop = lazy(() => import("../pages/InstallDesktop"));
const Challenges = lazy(() => import("../pages/Challenges"));
const StrictAssessment = lazy(() => import("../pages/StrictAssessment"));
const MyChallenges = lazy(() => import("../pages/MyChallenges"));
const Organisation = lazy(() => import("../pages/Organisation"));
const AdminOrganisations = lazy(() => import("../pages/AdminOrganisations"));

const isDesktop = isDesktopRuntime();

/* ------------------------------------------------------------------ */
/* Shared layout — identical shell on web and desktop                  */
/* ------------------------------------------------------------------ */

function AppLayout({ children }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(
    () =>
      typeof document !== "undefined" && Boolean(document.fullscreenElement),
  );
  const { user } = useAuth();

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
      {!isFullscreen && !user && <Navbar />}
      <div
        className={`app-shell-body${user ? " app-shell-body-authenticated" : ""}${isDesktop && !user ? " desktop-app-shell-unauthenticated" : ""}`}
      >
        {user && (
          <RoleNavigation
            open={navigationOpen}
            onNavigate={() => setNavigationOpen(false)}
            onToggle={setNavigationOpen}
          />
        )}
        {user && navigationOpen && (
          <button
            type="button"
            className="role-navigation-backdrop"
            aria-label="Close navigation"
            onClick={() => setNavigationOpen(false)}
          />
        )}
        <main className="app-shell-content">
          <div className="app-shell-page">
            <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
          </div>
          {!isFullscreen && <Footer />}
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Supervised evaluation desktop gate (web only)                       */
/* ------------------------------------------------------------------ */

function StrictDesktopGate() {
  const [downloadNotice, setDownloadNotice] = useState("");

  const handleDownload = (event) => {
    if (isMobileDevice()) {
      event.preventDefault();
      setDownloadNotice(
        "The CogniClash desktop app is available on Windows. Open this page on a desktop computer to download it.",
      );
    }
  };

  return (
    <div className="install-desktop-page">
      <div className="install-desktop-card">
        <div className="install-desktop-icon" aria-hidden="true">
          <Monitor size={26} />
        </div>
        <p className="install-desktop-eyebrow">Supervised evaluation</p>
        <h1>
          This evaluation runs in the
          <br />
          <span>CogniClash desktop app</span>
        </h1>
        <p className="install-desktop-copy">
          This supervised evaluation uses a secure desktop environment to
          support a consistent experience for everyone. Install the free
          CogniClash app on Windows, then sign in with your existing account.
        </p>
        <div className="install-desktop-meta">
          <span>
            <ShieldCheck size={14} /> Secure &amp; proctored
          </span>
          <span>v{desktopPackage.version} · Windows</span>
        </div>
        <a
          className="install-desktop-download"
          href={DOWNLOAD_URL}
          onClick={handleDownload}
          target="_blank"
          rel="noreferrer"
        >
          Download CogniClash <ArrowUpRight size={15} />
        </a>
        {downloadNotice && (
          <p className="install-desktop-copy" role="status">
            {downloadNotice}
          </p>
        )}
        <Link to="/" className="btn-secondary install-desktop-back">
          Back to CogniClash
        </Link>
        <ol className="install-desktop-steps">
          <li>Download and run the installer.</li>
          <li>Sign in with your existing CogniClash account.</li>
          <li>Return to your evaluation to continue.</li>
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

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
        This section is available only to the authorized CogniClash role for
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
      <div className="web-auth-session-note" role="status">
        Your saved session could not be verified. You can still sign in.
        <button
          type="button"
          className="btn-secondary"
          onClick={refreshProfile}
        >
          Retry
        </button>
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<AuthRouteSkeleton />}>
      <AuthPage mode={mode} />
    </Suspense>
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

/* ------------------------------------------------------------------ */
/* Router — one shared table for web and desktop                       */
/* ------------------------------------------------------------------ */

export default function AppRouter() {
  const Router = HashRouter;

  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<AuthAwareHome />} />
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
          {!isDesktop && (
            <Route
              path="/install-desktop"
              element={
                <AppLayout>
                  <InstallDesktop />
                </AppLayout>
              }
            />
          )}
          <Route
            path="/strict-assessment/:moduleId"
            element={
              isDesktop ? (
                <ProtectedLayout
                  allowedRoles={[
                    ASSESSMENT_ROLES.CANDIDATE,
                    ASSESSMENT_ROLES.ORGANIZATION_USER,
                  ]}
                >
                  <StrictAssessment />
                </ProtectedLayout>
              ) : (
                <AppLayout>
                  <StrictDesktopGate />
                </AppLayout>
              )
            }
          />
          <Route
            path="/challenges"
            element={
              <ProtectedLayout>
                <Challenges />
              </ProtectedLayout>
            }
          />
          <Route
            path="/my-challenges"
            element={
              <ProtectedLayout>
                <MyChallenges />
              </ProtectedLayout>
            }
          />
          <Route
            path="/organisation"
            element={
              <ProtectedLayout>
                <Organisation />
              </ProtectedLayout>
            }
          />
          <Route
            path="/admin/organisations"
            element={
              <ProtectedLayout allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}>
                <AdminOrganisations />
              </ProtectedLayout>
            }
          />
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
                <Navigate to="/my-challenges" replace />
              </ProtectedLayout>
            }
          />
          <Route
            path="/learning"
            element={
              <ProtectedLayout
                allowedRoles={[
                  ASSESSMENT_ROLES.CANDIDATE,
                  ASSESSMENT_ROLES.ORGANIZATION_USER,
                ]}
              >
                <LearningCenter />
              </ProtectedLayout>
            }
          />
          <Route
            path="/certificates"
            element={<Navigate to="/my-challenges" replace />}
          />
          <Route path="/settings" element={<Navigate to="/" replace />} />
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
          <Route
            path="/results"
            element={<Navigate to="/my-challenges" replace />}
          />
          <Route
            path="/admin"
            element={
              <ProtectedLayout allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}>
                <GlobalChallengeAdmin />
              </ProtectedLayout>
            }
          />
          <Route
            path="/admin/weekly-assessment"
            element={
              <ProtectedLayout allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}>
                <Navigate to="/admin" replace />
              </ProtectedLayout>
            }
          />
          <Route
            path="/admin/rankings"
            element={
              <ProtectedLayout allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}>
                <Navigate to="/admin" replace />
              </ProtectedLayout>
            }
          />
          <Route
            path="/admin/questions"
            element={
              <ProtectedLayout allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}>
                <Navigate to="/admin" replace />
              </ProtectedLayout>
            }
          />
          <Route
            path="/admin/learning"
            element={
              <ProtectedLayout allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}>
                <LearningCenter adminView />
              </ProtectedLayout>
            }
          />
          <Route
            path="/admin/weekly-roster"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/participants"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/rankings/individual"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/rankings/organizations"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/weekly-history"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/certificates"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/assessments"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/organizations-users"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/settings"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/*"
            element={
              <ProtectedLayout allowedRoles={[ASSESSMENT_ROLES.SUPER_ADMIN]}>
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

/* Logged-out users start at the sign-in experience (desktop-style flow);
   the full landing page lives one click away. Logged-in users land
   directly in the app dashboard — on both web and desktop. */
function AuthAwareHome() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) {
    return <AuthRouteSkeleton />;
  }
  if (isAuthenticated && user) {
    return (
      <ProtectedLayout>
        <DashboardRoute />
      </ProtectedLayout>
    );
  }
  return isDesktop ? <Navigate to="/login" replace /> : <PublicLanding />;
}
