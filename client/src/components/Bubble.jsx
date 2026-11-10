import { formatTime } from '../hooks.js';

// side: which messages appear on the right (the viewer's own side).
export default function Bubble({ message, mineIs }) {
  const mine = message.sender === mineIs;
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
          mine ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-white text-stone-800 border border-stone-200 rounded-bl-sm'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p className={`mt-1 text-[11px] ${mine ? 'text-emerald-100' : 'text-stone-400'}`}>
          {message.sender === 'agent' ? 'Verdant support · ' : ''}
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
