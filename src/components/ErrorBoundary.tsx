import { Component, ErrorInfo, ReactNode } from "react";
import { ShieldAlert, RotateCcw, Home } from "lucide-react";
import { captureSafeException } from "@lpu-events/shared";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught student-web error:", error, errorInfo);
    captureSafeException(error, {
      componentStack: errorInfo.componentStack,
      surface: 'student-web-react-root'
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 text-center bg-bg text-on-surface">
          <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shadow-xl mb-4">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black font-heading mb-2">Something went wrong</h2>
          <p className="text-on-surface-muted text-sm max-w-md mb-6 leading-relaxed">
            {this.state.error?.message || "An unexpected error occurred while rendering the page."}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-surface-2 hover:bg-surface-3 text-on-surface border border-outline text-xs font-bold transition-all cursor-pointer"
            >
              <RotateCcw className="h-4 w-4 text-primary" />
              <span>Try Again</span>
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary text-white text-xs font-bold transition-all cursor-pointer shadow-orange hover:shadow-lg"
            >
              <Home className="h-4 w-4" />
              <span>Reload Page</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
