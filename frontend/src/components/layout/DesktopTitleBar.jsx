import { useEffect, useState } from "react";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import codeclashLogo from "../../../../desktop/assets/codeclash.ico";

export default function DesktopTitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;
    const desktopWindow = window.codeClashDesktop.window;
    const unsubscribe = desktopWindow.onMaximizeChanged((isMaximized) => {
      setMaximized(Boolean(isMaximized));
    });

    desktopWindow
      .isMaximized()
      .then((isMaximized) => {
        if (mounted) setMaximized(Boolean(isMaximized));
      })
      .catch((error) => {
        console.error("Unable to read desktop window state:", error);
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const controlWindow = async (action) => {
    try {
      await window.codeClashDesktop.window.control(action);
    } catch (error) {
      console.error("Unable to control the CodeClash window:", error);
    }
  };

  const toggleMaximize = () => controlWindow("toggle-maximize");

  return (
    <header
      className="desktop-titlebar"
      onDoubleClick={toggleMaximize}
      aria-label="CodeClash window controls"
    >
      <div className="desktop-titlebar-brand">
        <img className="desktop-titlebar-mark" src={codeclashLogo} alt="" />
        <strong>CodeClash</strong>
      </div>
      <div className="desktop-titlebar-actions">
        <button
          type="button"
          className="desktop-titlebar-button"
          aria-label="Minimize window"
          title="Minimize"
          onClick={() => controlWindow("minimize")}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="desktop-titlebar-button"
          aria-label={maximized ? "Restore window" : "Maximize window"}
          title={maximized ? "Restore" : "Maximize"}
          onClick={toggleMaximize}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {maximized ? (
            <Minimize2 size={14} aria-hidden="true" />
          ) : (
            <Maximize2 size={14} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="desktop-titlebar-button desktop-titlebar-close"
          aria-label="Close CodeClash"
          title="Close"
          onClick={() => controlWindow("close")}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
