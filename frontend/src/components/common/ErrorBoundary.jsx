import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "An unexpected rendering error occurred.",
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "2rem",
            color: "#e8e8e8",
            background: "#141414",
            minHeight: "100vh",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h2>Something went wrong</h2>
          <p>{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "0.6rem 1.2rem",
              cursor: "pointer",
            }}
          >
            Reload the app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
