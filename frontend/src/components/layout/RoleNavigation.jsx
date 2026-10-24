import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LockKeyhole, LockKeyholeOpen, LogOut } from "lucide-react";
import api from "../../services/api";
import UserAvatar from "../user/UserAvatar";
import { ROLE_NAVIGATION } from "../../routes/roleNavigation";
import { getAssessmentRole } from "../../routes/roleAccess";
import { useAuth } from "../../context/AuthContext";

export default function RoleNavigation({
  open = false,
  onNavigate,
  desktop = false,
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState("");
  const [dailyChallengeCompleted, setDailyChallengeCompleted] = useState(false);
  const role = user ? getAssessmentRole(user) : null;
  const links = role ? ROLE_NAVIGATION[role] || ROLE_NAVIGATION.CANDIDATE : [];

  useEffect(() => {
    let mounted = true;
    const refreshDailyChallengeStatus = async () => {
      if (!user) {
        setDailyChallengeCompleted(false);
        return;
      }
      try {
        const { data } = await api.get("/weekly-assessments/current");
        if (mounted) {
          setDailyChallengeCompleted(data?.submission?.status === "FINALIZED");
        }
      } catch (statusError) {
        console.warn(
          "Unable to load daily challenge completion status:",
          statusError.message,
        );
      }
    };
    const handleDailyChallengeUpdate = () => refreshDailyChallengeStatus();

    refreshDailyChallengeStatus();
    window.addEventListener("ccp-daily-challenge-updated", handleDailyChallengeUpdate);
    return () => {
      mounted = false;
      window.removeEventListener("ccp-daily-challenge-updated", handleDailyChallengeUpdate);
    };
  }, [user]);

  if (!user) return null;

  const handleSignOut = async () => {
    setSignOutError("");
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      setSignOutError("Could not sign out. Please try again.");
    }
  };

  return (
    <>
      {open && (
        <button
          type="button"
          className="role-navigation-backdrop"
          aria-label="Close navigation"
          onClick={onNavigate}
        />
      )}
      <aside
        id={desktop ? "desktop-navigation" : "role-navigation"}
        className={`role-navigation${open ? " is-open" : ""}${desktop ? " desktop-navigation" : ""}`}
        aria-label="Main navigation"
      >
        {desktop && (
          <Link
            to="/"
            className="desktop-navigation-brand"
            onClick={onNavigate}
          >
            <span>Welcome,</span>
            <strong>{user.name || "there"}</strong>
          </Link>
        )}
        {!desktop && (
          <div className="role-navigation-heading">
            <span className="role-navigation-caption">CodeClash</span>
          </div>
        )}
        <nav className="role-navigation-links">
          {links.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/" || path === "/admin"}
              className={({ isActive }) =>
                [
                  isActive ? "active" : "",
                  path === "/weekly-assessment" ? "daily-challenge-link" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onClick={onNavigate}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
              {path === "/weekly-assessment" && (
                dailyChallengeCompleted ? (
                  <LockKeyholeOpen
                    className="daily-challenge-lock"
                    size={15}
                    aria-label="Daily challenge completed"
                    title="Daily challenge completed"
                  />
                ) : (
                  <LockKeyhole
                    className="daily-challenge-lock"
                    size={15}
                    aria-label="Daily challenge not completed"
                    title="Daily challenge not completed"
                  />
                )
              )}
            </NavLink>
          ))}
        </nav>
        {desktop && (
          <div className="desktop-navigation-account">
            <Link
              to="/profile"
              className="desktop-navigation-profile"
              onClick={onNavigate}
            >
              <UserAvatar name={user.name} size={34} />
              <span>
                <strong>{user.name || "Profile"}</strong>
                <small>{user.email}</small>
              </span>
            </Link>
            <button
              type="button"
              className="desktop-navigation-signout"
              onClick={handleSignOut}
            >
              <LogOut size={15} aria-hidden="true" />
              Sign out
            </button>
            {signOutError && (
              <p className="desktop-navigation-error" role="alert">
                {signOutError}
              </p>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
