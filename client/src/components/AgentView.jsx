import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { formatTime, usePolling } from '../hooks.js';
import Bubble from './Bubble.jsx';

function ConversationList({ items, selected, onSelect, error }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const conversations = items ?? [];
  const counts = {
    all: conversations.length,
    review: conversations.filter((c) => c.awaiting_reply).length,
    replied: conversations.filter((c) => !c.awaiting_reply && c.last_sender === 'agent').length,
  };
  const visibleItems = conversations.filter((c) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'review' && c.awaiting_reply) ||
      (filter === 'replied' && !c.awaiting_reply && c.last_sender === 'agent');
    const searchable = `${c.name} ${c.phone} ${c.last_body}`.toLowerCase();
    return matchesFilter && searchable.includes(query.trim().toLowerCase());
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-50">
      <div className="border-b border-stone-200 px-4 pb-4 pt-5 sm:px-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
              Support
            </p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-stone-900">Inbox</h1>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            {counts.review} to review
          </span>
        </div>

        <label className="mt-4 flex items-center gap-2.5 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-stone-400 transition focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/10">
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
            <circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.5" />
            <path d="m13.2 13.2 3.2 3.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, number or message"
            aria-label="Search conversations"
            className="min-w-0 flex-1 bg-transparent text-xs text-stone-800 outline-none placeholder:text-stone-400"
          />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-1" role="tablist" aria-label="Filter inbox">
          {[
            ['all', 'All'],
            ['review', 'Needs review'],
            ['replied', 'Replied'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-md px-1.5 py-2 text-[11px] font-medium transition sm:text-xs ${
                filter === value
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              {label}
              <span className={`ml-1 ${filter === value ? 'text-emerald-800' : 'text-stone-400'}`}>
                {counts[value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="border-b border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-700">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items === null && <p className="p-4 text-sm text-stone-400">Loading inbox…</p>}
        {items?.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-stone-700">Your inbox is clear</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              New customer conversations will appear here.
            </p>
          </div>
        )}
        {items?.length > 0 && visibleItems.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-stone-700">No matching conversations</p>
            <p className="mt-1 text-xs text-stone-500">Try another search or inbox filter.</p>
          </div>
        )}
      {visibleItems.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`block w-full border-b border-stone-200 border-l-[3px] px-4 py-3.5 text-left transition sm:px-5 ${
            selected === c.id
              ? 'border-l-emerald-800 bg-emerald-50/80'
              : 'border-l-transparent hover:bg-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
              selected === c.id ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-emerald-900'
            }`}>
              {c.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-stone-800">{c.name}</span>
                <span className="shrink-0 text-[11px] text-stone-400">{formatTime(c.last_message_at)}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-stone-500">{c.phone}</span>
            </span>
          </div>
          <p className="mt-2 truncate pl-12 text-xs leading-5 text-stone-500">
            {c.last_sender === 'agent' ? 'You: ' : 'Customer: '}
            {c.last_body}
          </p>
          {c.awaiting_reply && (
            <span className="ml-12 mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-2.5 py-1 text-[10px] font-medium text-emerald-900">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
              {c.last_sender === 'agent' ? 'Draft in progress' : 'Reply needed'}
              </span>
          )}
        </button>
      ))}
      </div>
    </div>
  );
}

function DraftBox({ draft, onApproved, onChanged }) {
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lastId = useRef(null);

  // Load a new draft into the box, but never overwrite what the agent is typing.
  useEffect(() => {
    if (!draft) return;
    if (draft.id !== lastId.current) {
      lastId.current = draft.id;
      setText(draft.body ?? '');
      setDirty(false);
      setError('');
    } else if (!dirty && draft.body && draft.body !== text) {
      setText(draft.body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (!draft) {
    return <p className="text-sm text-stone-400">Nothing to reply to. You're all caught up.</p>;
  }

  const pending = draft.status === 'pending';
  const failed = draft.status === 'failed';

  const approve = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/agent/drafts/${draft.id}/approve`, { method: 'POST', body: { text } });
      setDirty(false);
      lastId.current = null;
      setText('');
      onApproved();
    } catch (err) {
      setError(err.message);
      if (err.status === 409) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setError('');
    try {
      await api(`/api/agent/drafts/${draft.id}/regenerate`, { method: 'POST' });
      lastId.current = null;
      setDirty(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">AI suggested reply</h3>
        {pending && <span className="text-xs text-stone-400">Drafting…</span>}
        {draft.status === 'ready' && draft.needs_human && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            Check before sending
          </span>
        )}
        <button
          onClick={regenerate}
          disabled={busy || pending}
          className="ml-auto text-xs text-stone-500 underline hover:text-stone-800 disabled:opacity-40"
        >
          Regenerate
        </button>
      </div>

      {draft.status === 'ready' && draft.needs_human && draft.reason && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{draft.reason}</p>
      )}
      {failed && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          The AI draft could not be generated, so please write a reply yourself (or try Regenerate).
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        rows={5}
        maxLength={2000}
        disabled={pending && !dirty}
        placeholder={pending ? 'The AI is writing a draft…' : 'Write your reply…'}
        className="w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:bg-stone-100"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-400">Nothing is sent until you approve.</span>
        <button
          onClick={approve}
          disabled={busy || !text.trim()}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Approving…' : 'Approve & send'}
        </button>
      </div>
    </div>
  );
}

function ConversationPanel({ id, onActivity, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const bottom = useRef(null);

  const refresh = async () => {
    try {
      setData(await api(`/api/agent/conversations/${id}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => setData(null), [id]);
  usePolling(refresh, 3000, [id]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages.length]);

  if (!data) return <p className="p-4 text-sm text-stone-400">{error || 'Loading…'}</p>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <button onClick={onBack} className="text-sm text-stone-500 md:hidden">
          ← Back
        </button>
        <div>
          <p className="text-sm font-semibold">{data.conversation.name}</p>
          <p className="text-xs text-stone-400">{data.conversation.phone}</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-stone-100/60 p-4">
        {data.messages.map((m) => (
          <Bubble key={m.id} message={m} mineIs="agent" />
        ))}
        <div ref={bottom} />
      </div>
      <div className="border-t border-stone-200 bg-white p-4">
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <DraftBox
          draft={data.draft}
          onApproved={() => {
            refresh();
            onActivity();
          }}
          onChanged={refresh}
        />
      </div>
    </div>
  );
}

export default function AgentView({ onSignedOut }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const refresh = async () => {
    try {
      const { conversations } = await api('/api/agent/conversations');
      setItems(conversations);
      setError('');
    } catch (err) {
      if (err.status === 401) return onSignedOut();
      setError(err.message);
    }
  };
  usePolling(refresh, 4000);

  return (
    <div className="mx-auto flex h-full min-h-[calc(100vh-64px)] max-w-[1440px] overflow-hidden bg-white md:px-6 md:py-6">
      <div className="flex min-h-0 flex-1 overflow-hidden border-y border-stone-200 md:rounded-2xl md:border md:shadow-sm">
      <aside className={`${selected ? 'hidden md:block' : 'block'} w-full shrink-0 border-r border-stone-200 md:w-[360px]`}>
        <ConversationList items={items} selected={selected} onSelect={setSelected} error={error} />
      </aside>
      <section className={`${selected ? 'block' : 'hidden md:block'} min-w-0 flex-1 bg-stone-50`}>
        {selected ? (
          <ConversationPanel key={selected} id={selected} onActivity={refresh} onBack={() => setSelected(null)} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div>
              <p className="text-sm font-medium text-stone-700">Select a conversation</p>
              <p className="mt-1 text-xs text-stone-500">Messages and reply suggestions will appear here.</p>
            </div>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
