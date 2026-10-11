import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import {
  loginWithPassword,
  requestRegistrationOtp,
  requestPasswordReset,
  resetPassword,
  verifyRegistrationOtp,
} from "../services/authService";
import { useAuth } from "../context/AuthContext";

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--bg-main)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  padding: "11px 12px",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
};

export default function AuthPage({ mode }) {
  const isRegistration = mode === "register";
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [userId, setUserId] = useState("");
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const normalizedEmail = email.trim().toLowerCase();

  const continueToPlatform = (user) => {
    signIn(user);
    const target = location.state?.from;
    navigate(
      typeof target === "string"
        ? target
        : target?.pathname
          ? `${target.pathname}${target.search || ""}`
          : "/",
      { replace: true },
    );
  };

  const requestRegistrationCode = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (name.trim().length < 2 || name.trim().length > 100) {
      setError("Your full name must be between 2 and 100 characters.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
      setError("Your password must be between 8 and 72 bytes.");
      return;
    }

    setBusy(true);
    try {
      const result = await requestRegistrationOtp({
        name: name.trim(),
        email: normalizedEmail,
        password,
      });
      setUserId(result.userId);
      setRequested(true);
      setOtp("");
      setMessage(result.message || "A verification code was sent to your email.");
    } catch (requestError) {
      setError(requestError.message || "Unable to send a verification code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyRegistrationCode = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await verifyRegistrationOtp({ userId, otp: otp.trim() });
      continueToPlatform(user);
    } catch (verificationError) {
      setError(
        verificationError.message ||
          "That code could not be verified. Request a new code and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const signInWithPassword = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await loginWithPassword({
        email: normalizedEmail,
        password,
      });
      continueToPlatform(user);
    } catch (loginError) {
      setError(loginError.message || "Unable to sign in with those credentials.");
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (!resetRequested) {
        const result = await requestPasswordReset(normalizedEmail);
        setResetRequested(true);
        setMessage(
          result.message ||
            "If an account exists for that email, a password reset code has been sent.",
        );
      } else {
        const result = await resetPassword({
          email: normalizedEmail,
          otp: otp.trim(),
          password,
        });
        setResetMode(false);
        setResetRequested(false);
        setPassword("");
        setOtp("");
        setMessage(result.message || "Password updated. Please sign in.");
      }
    } catch (resetError) {
      setError(resetError.message || "Unable to reset your password.");
    } finally {
      setBusy(false);
    }
  };

  const startPasswordReset = () => {
    setResetMode(true);
    setResetRequested(false);
    setPassword("");
    setOtp("");
    setError("");
    setMessage("");
  };

  const cancelPasswordReset = () => {
    setResetMode(false);
    setResetRequested(false);
    setPassword("");
    setOtp("");
    setError("");
    setMessage("");
  };

  const resendPasswordResetCode = async () => {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await requestPasswordReset(normalizedEmail);
      setOtp("");
      setPassword("");
      setMessage(
        result.message ||
          "If an account exists for that email, a password reset code has been sent.",
      );
    } catch (resetError) {
      setError(resetError.message || "Unable to send a new reset code.");
    } finally {
      setBusy(false);
    }
  };

  const detailsChanged = () => {
    if (requested) {
      setRequested(false);
      setUserId("");
      setOtp("");
      setMessage("");
    }
  };

  const submitHandler = isRegistration
    ? requested
      ? verifyRegistrationCode
      : requestRegistrationCode
    : resetMode
      ? handlePasswordReset
      : signInWithPassword;

  return (
    <main
      style={{
        minHeight: "calc(100vh - 112px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <section
        style={{
          width: "min(100%, 440px)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          padding: 28,
          boxSizing: "border-box",
        }}
      >
        <h1 style={{ color: "var(--text-primary)", fontSize: 21, margin: "0 0 6px" }}>
          {isRegistration
            ? "Create your CodeClash account"
            : resetMode
              ? "Reset your password"
              : "Sign in to CodeClash"}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 22px" }}>
          {isRegistration
            ? "Register with your name, email, and password. Email verification is required before entering the platform."
            : resetMode
              ? resetRequested
                ? "Enter the code sent to your email and choose a new password."
                : "Enter your account email to receive a password reset code."
              : "Sign in with the email and password you used to register."}
        </p>

        <form onSubmit={submitHandler}>
          <div style={{ display: "grid", gap: 14 }}>
            {isRegistration && (
              <label style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                Full name
                <input
                  value={name}
                  onChange={(event) => {
                    detailsChanged();
                    setName(event.target.value);
                  }}
                  autoComplete="name"
                  maxLength={100}
                  required
                  disabled={requested}
                  style={{ ...fieldStyle, marginTop: 6 }}
                />
              </label>
            )}
            <label style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  detailsChanged();
                  setEmail(event.target.value);
                }}
                autoComplete="email"
                maxLength={254}
                required
                disabled={requested || (resetMode && resetRequested)}
                style={{ ...fieldStyle, marginTop: 6 }}
              />
            </label>
            {(!resetMode || resetRequested) && (
              <label style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                {resetMode ? "New password" : "Password"}
                <div style={{ position: "relative", marginTop: 6 }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      detailsChanged();
                      setPassword(event.target.value);
                    }}
                    autoComplete={
                      isRegistration || resetMode ? "new-password" : "current-password"
                    }
                    minLength={isRegistration || resetMode ? 8 : undefined}
                    maxLength={72}
                    required
                    disabled={isRegistration && requested}
                    style={{ ...fieldStyle, paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      display: "grid",
                      placeItems: "center",
                      padding: 4,
                      border: 0,
                      background: "transparent",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
            )}
            {((isRegistration && requested) || (resetMode && resetRequested)) && (
              <label style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                Six-digit {resetMode ? "password reset" : "email verification"} code
                <input
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  style={{ ...fieldStyle, marginTop: 6, letterSpacing: 4 }}
                />
              </label>
            )}
          </div>

          {error && (
            <p role="alert" style={{ color: "var(--color-danger)", fontSize: 12 }}>
              {error}
            </p>
          )}
          {message && (
            <p role="status" style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={
              busy ||
              ((isRegistration && requested) || (resetMode && resetRequested)) &&
                (otp.length !== 6 || password.length < 8)
            }
            className="btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              marginTop: 18,
              opacity: busy ? 0.65 : 1,
            }}
          >
            {busy
              ? "Please wait..."
              : isRegistration
                ? requested
                  ? "Verify email and continue"
                  : "Create account"
                : resetMode
                  ? resetRequested
                    ? "Update password"
                    : "Send reset code"
                  : "Sign in"}
          </button>
          {!isRegistration && !resetMode && (
            <button
              type="button"
              onClick={startPasswordReset}
              style={{
                display: "block",
                margin: "12px 0 0 auto",
                padding: 0,
                border: 0,
                background: "transparent",
                color: "var(--accent-blue-bright)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Forgot password?
            </button>
          )}
          {resetMode && (
            <button
              type="button"
              className="btn-secondary"
              onClick={
                resetRequested ? resendPasswordResetCode : cancelPasswordReset
              }
              disabled={busy}
              style={{ width: "100%", justifyContent: "center", marginTop: 9 }}
            >
              {resetRequested ? "Send a new reset code" : "Back to sign in"}
            </button>
          )}
          {isRegistration && requested && (
            <button
              type="button"
              className="btn-secondary"
              onClick={requestRegistrationCode}
              disabled={busy}
              style={{ width: "100%", justifyContent: "center", marginTop: 9 }}
            >
              Resend verification code
            </button>
          )}
        </form>

        <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "20px 0 0" }}>
          {isRegistration ? "Already registered? " : resetMode ? "" : "New to CodeClash? "}
          {resetMode ? null : (
            <Link
              to={isRegistration ? "/login" : "/register"}
              style={{ color: "var(--accent-blue-bright)" }}
            >
              {isRegistration ? "Sign in" : "Create an account"}
            </Link>
          )}
        </p>
      </section>
    </main>
  );
}
