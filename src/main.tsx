import { Component, ReactNode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element with id 'root' was not found.");
}

const rootElement: HTMLElement = container;

interface RuntimeErrorBoundaryState {
  error: Error | null;
}

class RuntimeErrorBoundary extends Component<
  { children: ReactNode },
  RuntimeErrorBoundaryState
> {
  state: RuntimeErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RuntimeErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error("ThreadBoard runtime render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            boxSizing: "border-box",
            padding: "24px",
            backgroundColor: "#121212",
            color: "#f4f4f4",
            fontFamily: "Segoe UI, system-ui, sans-serif",
          }}
        >
          <h1 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>
            ThreadBoard failed to render
          </h1>
          <p style={{ margin: "0 0 12px 0", opacity: 0.82 }}>
            A runtime error occurred while loading the board UI.
          </p>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              borderRadius: 8,
              padding: 12,
              fontSize: "0.85rem",
            }}
          >
            {String(this.state.error.message || this.state.error)}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

function renderBootFailure(error: unknown): void {
  console.error("ThreadBoard bootstrap failure:", error);

  rootElement.innerHTML = `
    <div style="min-height:100vh;box-sizing:border-box;padding:24px;background:#121212;color:#f4f4f4;font-family:Segoe UI,system-ui,sans-serif;">
      <h1 style="margin:0 0 12px 0;font-size:1.1rem;">ThreadBoard failed to start</h1>
      <p style="margin:0 0 12px 0;opacity:0.82;">A module failed during startup.</p>
      <pre style="margin:0;white-space:pre-wrap;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:12px;font-size:0.85rem;">${String(
        (error as Error)?.message ?? error
      )}</pre>
    </div>
  `;
}

void (async () => {
  try {
    const [{ default: App }, { ensureGhostSignature }] = await Promise.all([
      import("./App"),
      import("./ghost"),
    ]);

    let ghostSignature = null;

    try {
      ghostSignature = await ensureGhostSignature();
    } catch (error) {
      console.warn("Ghost signature generation failed:", error);
    }

    createRoot(rootElement).render(
      <RuntimeErrorBoundary>
        <App ghostSignature={ghostSignature} />
      </RuntimeErrorBoundary>
    );
  } catch (error) {
    renderBootFailure(error);
  }
})();
