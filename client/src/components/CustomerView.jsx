import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks.js';
import Bubble from './Bubble.jsx';

const TEST_CUSTOMERS = [
  { id: 'cust_1042', name: 'Aisha Khan', phone: '+919800000001', isTest: true },
  { id: 'cust_1043', name: 'Rohan Mehta', phone: '+919800000002', isTest: true },
  { id: 'cust_1044', name: 'Priya Nair', phone: '+919800000003', isTest: true },
];

const SAMPLES = [
  "Hi, my order #4471 hasn't arrived yet. Can I change the delivery address?",
  'What is your return policy?',
  'Do you deliver to Dubai?',
  'Is cash on delivery available for a ₹3,500 order?',
  "I think I'm allergic to the serum I bought. What should I do?",
];

const savedCustomerId = () => {
  try {
    return localStorage.getItem('selectedCustomerId') || TEST_CUSTOMERS[0].id;
  } catch {
    return TEST_CUSTOMERS[0].id;
  }
};

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

export default function CustomerView() {
  const [savedCustomers, setSavedCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState('');
  const [selectedId, setSelectedId] = useState(savedCustomerId);
  const [mobileShowList, setMobileShowList] = useState(true);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const bottom = useRef(null);

  const customers = [
    ...TEST_CUSTOMERS,
    ...savedCustomers.filter((customer) => !TEST_CUSTOMERS.some((test) => test.id === customer.id)),
  ];
  const customer = customers.find((item) => item.id === selectedId) ?? customers[0];

  const selectCustomer = (id) => {
    setSelectedId(id);
    setMobileShowList(false);
    try {
      localStorage.setItem('selectedCustomerId', id);
    } catch {}
  };

  const refreshCustomers = async () => {
    try {
      const { customers: rows } = await api('/api/customer/customers');
      setSavedCustomers(rows);
      setCustomersError('');
    } catch (err) {
      setCustomersError(err.message);
    } finally {
      setCustomersLoading(false);
    }
  };
  usePolling(refreshCustomers, 15000);

  useEffect(() => {
    if (!customersLoading && customer && customer.id !== selectedId) {
      selectCustomer(customer.id);
    }
  }, [customer, customersLoading, selectedId]);

  const refreshMessages = async () => {
    if (!customer) return;
    try {
      const data = await api(
        `/api/customer/conversation?customerId=${encodeURIComponent(customer.id)}`
      );
      setMessages(data.messages);
      setMessageError('');
    } catch (err) {
      setMessageError(err.message);
    }
  };
  useEffect(() => {
    setMessages([]);
    setMessageError('');
    setText('');
  }, [customer?.id]);
  usePolling(refreshMessages, 3000, [customer?.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const addCustomer = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const { customer: created } = await api('/api/customer/customers', {
        method: 'POST',
        body: { name: newName.trim(), phone: newPhone },
      });
      setSavedCustomers((current) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
      selectCustomer(created.id);
      setNewName('');
      setNewPhone('');
      setShowAddForm(false);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    if (sending || !text.trim() || !customer) return;
    setSending(true);
    setMessageError('');
    try {
      await api('/api/customer/messages', {
        method: 'POST',
        body: { customerId: customer.id, name: customer.name, phone: customer.phone, text },
      });
      setText('');
      await refreshMessages();
    } catch (err) {
      setMessageError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex h-full min-h-[calc(100vh-64px)] max-w-[1440px] bg-white md:px-6 md:py-6">
      <div className="flex min-h-0 flex-1 overflow-hidden border-y border-stone-200 md:rounded-2xl md:border md:shadow-sm">
        <aside
          className={`${mobileShowList ? 'flex' : 'hidden'} w-full shrink-0 flex-col bg-stone-50 md:flex md:w-[320px] md:border-r md:border-stone-200`}
        >
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
                Workspace
              </p>
              <h1 className="mt-1 text-lg font-semibold tracking-tight text-stone-900">Customers</h1>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAddForm((open) => !open);
                setCreateError('');
              }}
              className="rounded-lg bg-emerald-800 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-900"
            >
              <span className="mr-1.5 text-base leading-none">+</span>
              Add customer
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={addCustomer} className="space-y-3 border-b border-stone-200 bg-white p-4">
              <div>
                <label htmlFor="customer-name" className="mb-1 block text-xs font-medium text-stone-600">
                  Customer name
                </label>
                <input
                  id="customer-name"
                  autoFocus
                  required
                  maxLength={100}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Maya Sharma"
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                />
              </div>
              <div>
                <label htmlFor="customer-phone" className="mb-1 block text-xs font-medium text-stone-600">
                  Mobile number
                </label>
                <div className="flex overflow-hidden rounded-lg border border-stone-300 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/10">
                  <span className="flex items-center border-r border-stone-200 bg-stone-50 px-3 text-sm text-stone-500">
                    +91
                  </span>
                  <input
                    id="customer-phone"
                    required
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    pattern="[0-9]{10}"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit number"
                    className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none placeholder:text-stone-400"
                  />
                </div>
              </div>
              {createError && <p className="text-xs text-red-700">{createError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim() || newPhone.length !== 10}
                  className="rounded-lg bg-emerald-800 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? 'Saving…' : 'Save customer'}
                </button>
              </div>
            </form>
          )}

          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <p className="text-xs font-medium text-stone-500">All customers</p>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
              {customers.length}
            </span>
          </div>
          {customersError && <p className="px-5 py-2 text-xs text-red-700">{customersError}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {customersLoading && savedCustomers.length === 0 && (
              <p className="px-3 py-3 text-sm text-stone-400">Loading saved customers…</p>
            )}
            {customers.map((item) => (
              <button
                key={item.id}
                onClick={() => selectCustomer(item.id)}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                  selectedId === item.id
                    ? 'bg-emerald-100/70 text-stone-900'
                    : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    selectedId === item.id
                      ? 'bg-emerald-800 text-white'
                      : 'bg-stone-100 text-emerald-900'
                  }`}
                >
                  {initials(item.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    {item.isTest && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-800">
                        Test
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-stone-500">{item.phone}</span>
                </span>
                {selectedId === item.id && <span className="h-2 w-2 rounded-full bg-emerald-700" />}
              </button>
            ))}
          </div>
          <div className="border-t border-stone-200 px-5 py-3 text-xs text-stone-400">
            New customers are saved to your workspace.
          </div>
        </aside>

        <section
          className={`${mobileShowList ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col bg-stone-50 md:flex`}
        >
          {customer ? (
            <>
              <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-4 md:px-6">
                <button
                  type="button"
                  onClick={() => setMobileShowList(true)}
                  className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 md:hidden"
                  aria-label="Back to customers"
                >
                  ←
                </button>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-emerald-900">
                  {initials(customer.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-stone-900">{customer.name}</h2>
                  <p className="mt-0.5 text-xs text-stone-500">{customer.phone}</p>
                </div>
                <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  Test conversation
                </span>
              </header>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 md:px-8">
                {messages.length === 0 ? (
                  <div className="m-auto max-w-md text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-emerald-800 shadow-sm ring-1 ring-stone-200">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                        <path
                          d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-2 2v-6.5a7.5 7.5 0 1 1 16-3Z"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.7"
                        />
                      </svg>
                    </span>
                    <h3 className="mt-5 text-base font-semibold text-stone-800">Start a conversation</h3>
                    <p className="mt-1.5 text-sm leading-6 text-stone-500">
                      Send a test message as {customer.name}. It will appear in the agent inbox with a
                      suggested reply.
                    </p>
                  </div>
                ) : (
                  <div className="mt-auto space-y-3">
                    {messages.map((message) => (
                      <Bubble key={message.id} message={message} mineIs="customer" />
                    ))}
                  </div>
                )}
                <div ref={bottom} />
              </div>

              <div className="border-t border-stone-200 bg-white px-4 py-4 md:px-6">
                <div className="sample-prompts mb-3 flex gap-2 overflow-x-auto pb-1">
                  {SAMPLES.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setText(sample)}
                      className="max-w-[230px] shrink-0 truncate rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 transition hover:border-emerald-700 hover:text-emerald-800"
                      title={sample}
                    >
                      {sample}
                    </button>
                  ))}
                </div>
                <form onSubmit={send} className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) send(e);
                    }}
                    rows={2}
                    maxLength={2000}
                    placeholder="Write a message as the customer…"
                    className="min-h-[48px] flex-1 resize-none rounded-xl border border-stone-300 px-3.5 py-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  />
                  <button
                    disabled={sending || !text.trim()}
                    className="h-11 shrink-0 rounded-xl bg-emerald-800 px-4 text-sm font-medium text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </form>
                {messageError && <p className="mt-2 text-xs text-red-700">{messageError}</p>}
                <p className="mt-2 text-[11px] text-stone-400">Press Enter to send · Shift + Enter for a new line</p>
              </div>
            </>
          ) : (
            <div className="m-auto p-8 text-center text-sm text-stone-500">Choose a customer to open the chat.</div>
          )}
        </section>
      </div>
    </div>
  );
}
