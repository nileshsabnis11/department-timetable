export default function SectionCard({
  title,
  description,
  actions,
  className = '',
  bodyClassName = '',
  children,
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div className={`px-5 py-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
