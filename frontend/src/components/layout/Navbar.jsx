import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Code2, LogOut, Menu, UserRound, X } from "lucide-react";

import UserAvatar from "../user/UserAvatar";
import { useAuth } from "../../context/AuthContext";

export default function Navbar({ navigationOpen = false, onToggleNavigation }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const displayName = user?.name?.toUpperCase() || "ACCOUNT";

  useEffect(() => {
    setAccountMenuOpen(false);
    setSignOutError("");
  }, [location.pathname]);

  const handleSignOut = async () => {
    setSignOutError("");
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      setSignOutError(
        "Sign out could not be confirmed. Your session may still be active.",
      );
    }
  };

  return (
    <header className="app-navbar">
      <div className="app-navbar-brand-group">
        {user && onToggleNavigation && (
          <button
            className="app-navbar-mobile-toggle"
            type="button"
            aria-label={
              navigationOpen ? "Close navigation" : "Open navigation"
            }
            aria-expanded={navigationOpen}
            aria-controls="role-navigation"
            onClick={onToggleNavigation}
          >
            {navigationOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}
        <Link to="/" className="app-navbar-brand">
          <Code2 size={27} aria-hidden="true" />
          <span>CodeClash</span>
        </Link>
      </div>

      {user ? (
        <div className="app-navbar-account">
          <div className="app-navbar-account-menu">
            <button
              type="button"
              className="app-navbar-account-button"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <UserAvatar name={displayName} size={32} />
              <span>{displayName}</span>
            </button>
            {accountMenuOpen && (
              <div className="app-navbar-account-popover" role="menu">
                <div className="app-navbar-account-details">
                  <strong>{displayName}</strong>
                  <span>{user.email}</span>
                </div>
                <Link
                  role="menuitem"
                  to="/profile"
                  onClick={() => setAccountMenuOpen(false)}
                >
                  <UserRound size={15} aria-hidden="true" />
                  Profile
                </Link>
                <button
                  role="menuitem"
                  type="button"
                  onClick={handleSignOut}
                >
                  <LogOut size={15} aria-hidden="true" />
                  Sign out
                </button>
                {signOutError && <p role="alert">{signOutError}</p>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <Link to="/login" className="app-navbar-sign-in">
          Sign in
        </Link>
      )}
    </header>
  );
}
