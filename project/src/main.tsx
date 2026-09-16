import { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('NBG application error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <main className="flex min-h-screen items-center justify-center bg-[#f4f1eb] px-6 text-[#123b4b]"><section className="w-full max-w-lg border border-[#e4b8ad] bg-[#fff7f4] p-8 text-center md:p-12"><p className="eyebrow text-[#a55445]">NBG workspace</p><h1 className="mt-5 font-serif text-5xl leading-none">We hit an<br /><em>unexpected pause.</em></h1><p className="mt-6 text-sm leading-6 text-slate-600">This page could not finish loading. Return home and try again, or refresh the page.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><button onClick={() => window.location.assign('/')} className="btn-primary">Back to home</button><button onClick={() => window.location.reload()} className="btn-secondary">Reload page</button></div></section></main>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>
);
