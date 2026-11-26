import { Link } from "react-router-dom";
import { Brain } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function Navbar() {
  const { user } = useAuth();

  return (
    <header className="app-navbar">
      <div className="app-navbar-brand-group">
        <Link to="/" className="app-navbar-brand">
          <Brain size={27} aria-hidden="true" />
          <span>CogniClash</span>
        </Link>
      </div>
      {!user && (
        <Link to="/login" className="app-navbar-sign-in">
          Sign in
        </Link>
      )}
    </header>
  );
}
