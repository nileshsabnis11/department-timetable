const FIELD_BASE =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-500';

export function TextInput({ className = '', ...props }) {
  return <input type="text" className={`${FIELD_BASE} ${className}`} {...props} />;
}

export function TimeInput({ className = '', ...props }) {
  return <input type="time" className={`${FIELD_BASE} ${className}`} {...props} />;
}

export function NumberInput({ className = '', ...props }) {
  return <input type="number" className={`${FIELD_BASE} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${FIELD_BASE} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}
