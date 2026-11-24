import Button from '../ui/Button';

export default function AppHeader({
  onLoadSample,
  onReset,
  onOpenPublish,
  disabled = false,
  semesterControls,
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-sm font-bold tracking-tight text-white shadow-sm">
              TS
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
                Automated Timetable Generator
              </p>
              <h1 className="text-lg font-semibold leading-tight text-slate-900">
                Timetable Studio
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={onReset} disabled={disabled}>
              Clear data
            </Button>
            <Button variant="secondary" onClick={onLoadSample} disabled={disabled}>
              Load Sample Data
            </Button>
            {onOpenPublish ? (
              <Button
                onClick={onOpenPublish}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 font-semibold"
              >
                <span>🌐</span> Publish Live Site
              </Button>
            ) : null}
          </div>
        </div>

        {semesterControls ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Academic term
            </p>
            {semesterControls}
          </div>
        ) : null}
      </div>
    </header>
  );
}
