import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import brandIcon from "../../../../desktop/assets/codeclash.ico";

export default function Navbar() {
  const { user } = useAuth();

  return (
    <header className="app-navbar">
      <div className="app-navbar-brand-group">
        <Link to="/" className="app-navbar-brand">
          <img src={brandIcon} alt="" />
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
