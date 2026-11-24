import Button from '../ui/Button';
import Badge from '../ui/Badge';

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Saved timetable snapshots. One version can be marked as the published plan,
 * so it is obvious which snapshot the department has been given.
 */
export default function VersionsPanel({
  versions = [],
  publishedVersionId = null,
  onSave,
  onRestore,
  onDelete,
  onTogglePublish,
  disabled = false,
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Saved Versions</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Snapshot the current plan before a risky edit, compare alternatives, or mark the
            one that was published.
          </p>
        </div>
        <Button size="sm" onClick={onSave} disabled={disabled}>
          Save current as version
        </Button>
      </div>

      <div className="px-5 py-4">
        {versions.length === 0 ? (
          <p className="text-xs text-slate-500">
            No saved versions yet. Saving keeps the full timetable in this browser.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {versions.map((version) => {
              const published = version.id === publishedVersionId;
              return (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {version.label}
                      </p>
                      {published ? <Badge tone="emerald">Published</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatWhen(version.createdAt)} ·{' '}
                      {version.sessions?.length ?? 0} sessions
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onTogglePublish(version.id)}
                      disabled={disabled}
                    >
                      {published ? 'Unpublish' : 'Mark published'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onRestore(version.id)}
                      disabled={disabled}
                    >
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onDelete(version.id)}
                      disabled={disabled}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
