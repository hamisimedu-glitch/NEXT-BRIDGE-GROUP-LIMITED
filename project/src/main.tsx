import { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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

const root = createRoot(document.getElementById('root')!);
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hasSupabaseConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('YOUR_PROJECT_REF') &&
    !supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY')
);

if (!hasSupabaseConfig) {
  root.render(
    <main className="flex min-h-screen items-center justify-center bg-[#f4f1eb] px-6 py-12 text-[#17232b]">
      <section className="w-full max-w-2xl border border-[#c9c5bd] bg-white p-8 md:p-12">
        <p className="eyebrow text-[#087f88]">Next Bridge Group</p>
        <h1 className="mt-5 font-serif text-4xl leading-tight md:text-5xl">Supabase setup required</h1>
        <p className="mt-5 max-w-xl text-sm leading-6 text-slate-600">
          The site needs its Supabase project credentials before it can load.
        </p>
        <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-700">
          <li>Copy <code className="bg-slate-100 px-1">project/.env.example</code> to <code className="bg-slate-100 px-1">project/.env</code>.</li>
          <li>Set <code className="bg-slate-100 px-1">VITE_SUPABASE_URL</code> and <code className="bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code> from your Supabase project settings.</li>
          <li>Restart the development server.</li>
        </ol>
      </section>
    </main>
  );
} else {
  void import('./App.tsx').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <AppErrorBoundary><App /></AppErrorBoundary>
      </StrictMode>
    );
  });
}
