import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ROLE_NAVIGATION } from "../../routes/roleNavigation";
import { getAssessmentRole } from "../../routes/roleAccess";
import { useAuth } from "../../context/AuthContext";

export default function RoleNavigation({ open = false, onNavigate }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState("");
  const role = user ? getAssessmentRole(user) : null;
  const links = (role ? ROLE_NAVIGATION[role] || ROLE_NAVIGATION.CANDIDATE : [])
    .filter((link) => link.path !== "/profile");

  if (!user || !open) return null;

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
    <div className="role-navigation-popover" id="role-navigation">
      <p className="role-navigation-welcome">Welcome, {user.name || "there"}</p>
      <nav className="role-navigation-links" aria-label="Main navigation">
        {links.map(({ path, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/" || path === "/admin"}
            onClick={onNavigate}
          >
            {label}
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
    </div>
  );
}
