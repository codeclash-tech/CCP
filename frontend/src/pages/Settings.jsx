import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, RefreshCw, Settings2, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  DEFAULT_EDITOR_PREFERENCES,
  getEditorPreferences,
  saveEditorPreferences,
} from "../utils/editorPreferences";
import "../styles/productPages.css";

export default function Settings() {
  const { user } = useAuth();
  const isDesktop =
    typeof window !== "undefined" && Boolean(window.codeClashDesktop);
  const [preferences, setPreferences] = useState(getEditorPreferences);
  const [saved, setSaved] = useState(false);
  const [engineStatus, setEngineStatus] = useState("checking");
  const [checkingEngine, setCheckingEngine] = useState(false);

  const checkEngine = async () => {
    if (typeof window.codeClashDesktop?.engine?.status !== "function") return;
    setCheckingEngine(true);
    try {
      const status = await window.codeClashDesktop.engine.status();
      setEngineStatus(status?.status === "UP" ? "ready" : "unavailable");
    } catch {
      setEngineStatus("unavailable");
    } finally {
      setCheckingEngine(false);
    }
  };

  useEffect(() => {
    checkEngine();
  }, []);

  const updatePreference = (name, value) => {
    const next = { ...preferences, [name]: value };
    setPreferences(next);
    saveEditorPreferences(next);
    setSaved(true);
  };

  const resetPreferences = () => {
    const defaults = { ...DEFAULT_EDITOR_PREFERENCES };
    setPreferences(defaults);
    saveEditorPreferences(defaults);
    setSaved(true);
  };

  return (
    <main className="product-page settings-page">
      <header className="product-page-heading">
        <div>
          <p className="product-eyebrow">PREFERENCES</p>
          <h1>Settings</h1>
          <p>Adjust the code editor and check application readiness.</p>
        </div>
      </header>

      <section className="product-panel">
        <div className="product-panel-heading">
          <Settings2 size={18} />
          <div>
            <h2>Code editor</h2>
            <p>These preferences are saved on this device.</p>
          </div>
          {saved && (
            <span className="product-inline-status">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
        <div className="settings-grid">
          <label className="settings-control">
            <span>Font size</span>
            <select
              value={preferences.fontSize}
              onChange={(event) =>
                updatePreference("fontSize", Number(event.target.value))
              }
            >
              {[12, 13, 14, 15, 16, 18, 20].map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </label>
          <label className="settings-control">
            <span>Indent size</span>
            <select
              value={preferences.tabSize}
              onChange={(event) =>
                updatePreference("tabSize", Number(event.target.value))
              }
            >
              <option value={2}>2 spaces</option>
              <option value={4}>4 spaces</option>
            </select>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={preferences.wordWrap}
              onChange={(event) =>
                updatePreference("wordWrap", event.target.checked)
              }
            />
            <span>Wrap long lines</span>
          </label>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={resetPreferences}
        >
          Reset editor preferences
        </button>
      </section>

      {isDesktop && (
        <section className="product-panel">
          <div className="product-panel-heading">
            <span
              className={`engine-status-indicator ${engineStatus}`}
              aria-hidden="true"
            />
            <div>
              <h2>Code execution</h2>
              <p>
                {engineStatus === "ready"
                  ? "Ready"
                  : engineStatus === "unavailable"
                    ? "Temporarily unavailable"
                    : "Checking availability"}
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              disabled={checkingEngine}
              onClick={checkEngine}
            >
              <RefreshCw
                size={14}
                className={checkingEngine ? "is-spinning" : ""}
              />
              Check again
            </button>
          </div>
          {engineStatus === "unavailable" && (
            <p className="product-help">
              Restart CodeClash and try again. If this continues, contact
              support.
            </p>
          )}
        </section>
      )}

      <section className="product-panel">
        <div className="product-panel-heading">
          <UserRound size={18} />
          <div>
            <h2>Account</h2>
            <p>{user?.email || ""}</p>
          </div>
        </div>
        <Link className="product-text-link" to="/profile">
          Manage profile
        </Link>
      </section>
    </main>
  );
}
