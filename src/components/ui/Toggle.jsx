export function ToggleChip({ active, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
          : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
      } ${className}`}
    >
      {children}
    </button>
  );
}
