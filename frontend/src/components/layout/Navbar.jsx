import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Code2, Home, Info, LogOut, Swords } from "lucide-react";

import UserAvatar from "../user/UserAvatar";
import { useAuth } from "../../context/AuthContext";

const NAV_LINKS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/battle-room", label: "Battle Room", icon: Swords },
  { path: "/about", label: "About", icon: Info },
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  // Display the entire username in uppercase.
  const displayName = user?.name?.toUpperCase() || "ACCOUNT";

  const handleSignOut = async () => {
    setSignOutError("");

    try {
      await signOut();
      setMenuOpen(false);
      navigate("/login", { replace: true });
    } catch {
      setSignOutError(
        "Sign out could not be confirmed. Your session may still be active.",
      );
    }
  };

  return (
    <nav
      style={{
        background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border-color)",
        padding: "0 24px",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: "var(--font-ui)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Brand and navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 32,
        }}
      >
        <Link
          to="/"
          style={{
            color: "var(--accent-blue-bright)",
            fontSize: 18,
            fontWeight: 700,
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            letterSpacing: "-0.5px",
          }}
        >
          <Code2 size={22} />
          <span>CodeClash</span>
        </Link>

        <div style={{ display: "flex", gap: 2 }}>
            {NAV_LINKS.filter((link) => user || link.path === "/about").map((link) => {
              const isActive =
                location.pathname === link.path ||
                (link.path !== "/" && location.pathname.startsWith(link.path));

              const Icon = link.icon;

              return (
                <Link
                  key={link.path}
                  to={link.path}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 6,
                    fontSize: 13,
                    textDecoration: "none",
                    color: isActive
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    background: isActive
                      ? "var(--accent-blue-soft)"
                      : "transparent",
                    transition: "all 0.15s",
                    fontWeight: isActive ? 600 : 400,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Icon size={16} />
                  {link.label}
                </Link>
              );
            })}
        </div>
      </div>

      {/* User menu */}
      {user ? (
        <div style={{ position: "relative" }}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "transparent",
              color: "var(--text-primary)",
              border: "1px solid transparent",
              borderRadius: 8,
              padding: "4px 8px",
              cursor: "pointer",
              font: "inherit",
              fontSize: 12,
            }}
          >
            <UserAvatar name={displayName} size={32} />
            <span>{displayName}</span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                minWidth: 220,
                padding: 8,
                borderRadius: 8,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-color)",
                boxShadow: "0 10px 28px rgba(0,0,0,.3)",
                zIndex: 200,
              }}
            >
              {/* User details */}
              <div
                style={{
                  padding: "8px 10px 12px",
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                <div
                  style={{
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {displayName}
                </div>

                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11,
                    marginTop: 4,
                  }}
                >
                  {user.email}
                </div>
              </div>

              {/* Sign out */}
              <button
                role="menuitem"
                type="button"
                onClick={handleSignOut}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "9px 10px",
                  background: "transparent",
                  border: 0,
                  color: "var(--color-danger)",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <LogOut size={14} />
                Sign out
              </button>

              {signOutError && (
                <div
                  role="alert"
                  style={{
                    color: "var(--color-danger)",
                    fontSize: 11,
                    padding: "4px 10px",
                  }}
                >
                  {signOutError}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <Link
          to="/login"
          style={{
            color: "var(--accent-blue-bright)",
            fontSize: 13,
          }}
        >
          Sign in
        </Link>
      )}
    </nav>
  );
}
