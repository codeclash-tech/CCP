import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";

export function LoadingScreen({ message = "Loading your workspace..." }) {
  return (
    <main
      className="session-state"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoaderCircle className="session-state-icon" size={28} aria-hidden="true" />
      <span>{message}</span>
    </main>
  );
}

export function SessionErrorScreen({ message, onRetry }) {
  return (
    <main className="session-state" role="alert">
      <AlertCircle size={28} aria-hidden="true" />
      <h1>We couldn't verify your session</h1>
      <p>{message}</p>
      <button className="btn-primary" type="button" onClick={onRetry}>
        <RefreshCw size={15} aria-hidden="true" />
        Try again
      </button>
    </main>
  );
}
