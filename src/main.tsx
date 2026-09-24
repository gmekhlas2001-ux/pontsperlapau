// Application entry point — mounts the React tree under <div id="root">.
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { registerAppServiceWorker } from './pwa/registerServiceWorker'
import './index.css'

if (import.meta.env.PROD) {
  registerAppServiceWorker();
}

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
    <main className="flex min-h-dvh items-center justify-center bg-background p-4 sm:p-6">
      <section role="alert" className="w-full max-w-lg rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        <button type="button" className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </section>
    </main>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Application root element is missing');
// Vite can re-evaluate this entry point when a shared provider changes. Reuse
// its root so two React trees never compete to remove the same DOM nodes.
const root: Root = import.meta.hot?.data.root ?? createRoot(rootElement);
if (import.meta.hot) import.meta.hot.data.root = root;

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
