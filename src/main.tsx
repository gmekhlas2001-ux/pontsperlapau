// Application entry point — mounts the React tree under <div id="root">.
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

interface ErrorBoundaryState {
  failed: boolean;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failed', error, info);
  }

  render() {
    if (this.state.failed) {
      return <StartupMessage title="Something went wrong" detail="Reload the page. If the problem continues, contact the administrator." />;
    }
    return this.props.children;
  }
}

function StartupMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="min-h-screen bg-background p-6 flex items-center justify-center">
      <section role="alert" className="w-full max-w-lg rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      </section>
    </main>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Application root element is missing');
const root = createRoot(rootElement);

const hasBrowserConfiguration = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

if (!hasBrowserConfiguration) {
  root.render(
    <StartupMessage
      title="Application configuration is missing"
      detail="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the application."
    />,
  );
} else {
  void import('./App.tsx')
    .then(({ default: App }) => {
      root.render(
        <StrictMode>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </StrictMode>,
      );
    })
    .catch((error) => {
      console.error('Application startup failed', error);
      root.render(
        <StartupMessage
          title="The application could not start"
          detail="Reload the page. If the problem continues, contact the administrator."
        />,
      );
    });
}
