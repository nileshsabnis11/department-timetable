export default function ClashBanner({ clashInfo, proposals = [], onApply }) {
  if (!clashInfo || clashInfo.count === 0) return null;

  const visible = clashInfo.messages.slice(0, 5);
  const remaining = clashInfo.messages.length - visible.length;

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
      <p className="text-sm font-semibold text-rose-800">
        {clashInfo.count} clash{clashInfo.count === 1 ? '' : 'es'} after the last swap
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-rose-700">
        {visible.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
      {remaining > 0 ? (
        <p className="mt-1 pl-1 text-[11px] text-rose-500">+{remaining} more…</p>
      ) : null}

      {proposals.length > 0 && onApply ? (
        <div className="mt-2.5 rounded-lg border border-emerald-200 bg-white/70 px-3 py-2">
          <p className="text-[11px] font-semibold text-emerald-800">
            One-click fixes that reduce the clash count
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {proposals.map((proposal) => (
              <button
                key={`${proposal.sessionId}-${proposal.slotIds.join('-')}`}
                type="button"
                onClick={() => onApply(proposal.sessions)}
                className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800 transition hover:bg-emerald-50"
                title={`Fixes ${proposal.reduction} clash${
                  proposal.reduction === 1 ? '' : 'es'
                } — ${proposal.clashCount} would remain`}
              >
                Move {proposal.label} → {proposal.target}
                <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold">
                  −{proposal.reduction}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-1.5 text-[11px] text-rose-500">
        Hover a highlighted cell for details, undo the swap, or reset to the generated plan.
      </p>
    </section>
  );
}
