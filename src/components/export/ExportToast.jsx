export default function ExportToast({ toast, onDismiss }) {
  if (!toast) return null;
  const isError = toast.tone === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`fixed bottom-4 right-4 z-[60] flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
        isError
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      <span className="leading-snug">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className={`rounded p-0.5 text-base leading-none transition ${
          isError ? 'text-rose-400 hover:text-rose-700' : 'text-emerald-500 hover:text-emerald-800'
        }`}
      >
        ×
      </button>
    </div>
  );
}
