import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { ROLE_NAVIGATION } from "../../routes/roleNavigation";
import { getAssessmentRole } from "../../routes/roleAccess";
import { useAuth } from "../../context/AuthContext";

export default function RoleNavigation({ open = false, onNavigate, onToggle }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState("");
  const role = user ? getAssessmentRole(user) : null;
  const links = (role ? ROLE_NAVIGATION[role] || ROLE_NAVIGATION.CANDIDATE : [])
    .filter((link) => link.path !== "/profile");

  if (!user) return null;

  const handleSignOut = async () => {
    setSignOutError("");
    try {
      await signOut();
      onNavigate?.();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Could not sign out:", error);
      setSignOutError("Could not sign out. Please try again.");
    }
  };

  return (
    <aside
      id="role-navigation"
      className={`role-navigation${open ? " is-open" : ""}`}
    >
      <div className="role-navigation-header">
        <p className="role-navigation-welcome">
          Welcome,
          {" "}
          {user?.organization && user.organization !== "Unspecified"
            ? user.organization
            : user.name || "there"}
        </p>
        <button
          type="button"
          className="role-navigation-mobile-toggle"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-controls="role-navigation"
          aria-expanded={open}
          onClick={() => onToggle?.(!open)}
        >
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </div>
      <nav className="role-navigation-links" aria-label="Main navigation">
        {links.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/" || path === "/admin"}
            onClick={onNavigate}
          >
            {Icon && <Icon size={16} aria-hidden="true" />}
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="role-navigation-account">
        <NavLink to="/profile" onClick={onNavigate}>
          Profile
        </NavLink>
        <button type="button" onClick={handleSignOut}>
          Sign out
        </button>
        {signOutError && <p role="alert">{signOutError}</p>}
      </div>
    </aside>
  );
}
