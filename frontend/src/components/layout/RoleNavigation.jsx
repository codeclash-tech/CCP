import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Code2, LogOut } from "lucide-react";
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
  if (!user) return null;

  const role = getAssessmentRole(user);
  const links = ROLE_NAVIGATION[role] || ROLE_NAVIGATION.CANDIDATE;
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
          <Link to="/" className="desktop-navigation-brand" onClick={onNavigate}>
            <Code2 size={21} aria-hidden="true" />
            <span>CodeClash</span>
          </Link>
        )}
        <div className="role-navigation-heading">
          <span className="role-navigation-role">Workspace</span>
          {!desktop && (
            <span className="role-navigation-caption">CodeClash</span>
          )}
        </div>
        <nav className="role-navigation-links">
          {links.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/" || path === "/admin"}
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={onNavigate}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
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
