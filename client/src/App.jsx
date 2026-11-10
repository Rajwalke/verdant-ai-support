import { useEffect, useState } from 'react';
import { api } from './api.js';
import AgentView from './components/AgentView.jsx';
import CustomerView from './components/CustomerView.jsx';
import Login from './components/Login.jsx';
import darkLogo from '../image/Verdant & Co Leaf Logo dark mode.png';
import lightLogo from '../image/Verdant & Co Leaf Logo light mode.png';

const saved = () => {
  try {
    return localStorage.getItem('view') === 'agent' ? 'agent' : 'customer';
  } catch {
    return 'customer';
  }
};

const savedTheme = () => {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export default function App() {
  const [view, setView] = useState(saved);
  const [theme, setTheme] = useState(savedTheme);
  const [agent, setAgent] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    api('/api/agent/me')
      .then((d) => setAgent(d.agent))
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  const choose = (v) => {
    setView(v);
    try {
      localStorage.setItem('view', v);
    } catch {}
  };

  const signOut = async () => {
    await api('/api/agent/logout', { method: 'POST' }).catch(() => {});
    setAgent(null);
  };

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  const tab = (v, label) => (
    <button
      onClick={() => choose(v)}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition sm:px-4 sm:text-sm ${
        view === v ? 'bg-white text-emerald-900 shadow-sm' : 'text-stone-500 hover:text-stone-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className={`flex h-screen flex-col bg-stone-50 ${theme === 'dark' ? 'theme-dark' : ''}`}>
      <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 sm:px-6">
        <img
          src={theme === 'dark' ? darkLogo : lightLogo}
          alt="Verdant & Co"
          className="h-auto w-[min(168px,42vw)] shrink-0 object-contain"
        />
        <nav className="flex items-center gap-1 rounded-xl bg-stone-100 p-1" role="tablist" aria-label="View">
          {tab('customer', 'Customer')}
          {tab('agent', 'Agent')}
        </nav>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'day' : 'night'} mode`}
            aria-pressed={theme === 'dark'}
            title={`Switch to ${theme === 'dark' ? 'day' : 'night'} mode`}
            className="theme-toggle flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium transition"
          >
            {theme === 'dark' ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M12 2.5v2m0 15v2m9.5-9.5h-2m-15 0h-2m16.22-6.72-1.42 1.42M6.7 17.3l-1.42 1.42m13.44 0-1.42-1.42M6.7 6.7 5.28 5.28"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                <path
                  d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
              </svg>
            )}
            <span className="hidden sm:inline">{theme === 'dark' ? 'Day mode' : 'Night mode'}</span>
          </button>
          {view === 'agent' && agent && (
            <button onClick={signOut} className="px-1 text-xs font-medium text-stone-500 hover:text-stone-900">
              Sign out
            </button>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {view === 'customer' ? (
          <CustomerView />
        ) : !checked ? null : agent ? (
          <AgentView onSignedOut={() => setAgent(null)} />
        ) : (
          <Login onSignedIn={setAgent} />
        )}
      </main>
    </div>
  );
}
