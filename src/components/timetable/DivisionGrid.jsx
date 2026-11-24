import { useMemo } from 'react';
import GridTable from './GridTable';
import { FIXED_SLOT_TYPE } from '../../lib/fixedSlots';
import {
  buildCoverage,
  capacityWarnings,
  electiveGroupKey,
  practicalBlocks,
  swapOrMove,
} from './timetableUtils';

function TheoryContent({ session }) {
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="flex items-start justify-between gap-1">
        <p className="line-clamp-2 text-xs font-bold leading-tight text-slate-900" title={session.subjectName}>
          {session.subjectName}
        </p>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-600">
          {session.subjectCode}
        </span>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
        <span
          className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700"
          title={session.facultyName || session.facultyShortCode}
        >
          {session.facultyName || session.facultyShortCode}
        </span>
        {session.electiveGroupLabel ? (
          <span
            className="truncate rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700"
            title={`Parallel elective basket: ${session.electiveGroupLabel}`}
          >
            Elective
          </span>
        ) : null}
        <span className="truncate text-[10px] text-slate-400">{session.roomName}</span>
      </div>
    </div>
  );
}

function ParallelElectiveContent({ group }) {
  const label = group[0]?.electiveGroup ?? 'PE';
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="flex items-center justify-between gap-1">
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-800">
          PE · {label}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-indigo-500">
          {group.length} parallel
        </span>
      </div>
      <div className="space-y-1">
        {group.map((session) => (
          <div key={session.id} className="rounded bg-white/80 px-1.5 py-1 ring-1 ring-inset ring-indigo-100">
            <p className="truncate text-[10px] font-bold leading-tight text-slate-900" title={session.subjectName}>
              {session.subjectName}
            </p>
            <p className="truncate text-[9px] font-medium text-slate-500">
              {session.subjectCode} · {session.facultyName || session.facultyShortCode} · {session.roomName}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FixedContent({ session }) {
  return (
    <div className="flex h-full flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span aria-hidden="true" className="text-[10px]">
          🔒
        </span>
        <p className="text-xs font-bold tracking-tight text-violet-900">
          {session.label ?? session.subjectCode}
        </p>
      </div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-violet-600">
        Fixed slot · locked
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-1 text-[10px] text-slate-500">
        {session.facultyShortCode ? (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800">
            {session.facultyName || session.facultyShortCode}
          </span>
        ) : null}
        <span className="truncate text-slate-400">{session.roomName}</span>
      </div>
    </div>
  );
}

function PracticalContent({ session }) {
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className="line-clamp-2 text-xs font-bold leading-tight text-amber-950" title={session.subjectName}>
            {session.subjectName}
          </p>
          <span className="mt-0.5 inline-block rounded bg-amber-100/70 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-800">
            {session.subjectCode}
          </span>
        </div>
        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
          2 hrs
        </span>
      </div>
      <div className="mt-0.5 space-y-0.5">
        {(session.batches ?? []).map((batch) => (
          <div
            key={batch.batchId}
            className="rounded bg-amber-50 px-1.5 py-0.5 ring-1 ring-inset ring-amber-100"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-slate-700">
                {batch.batchName}
              </span>
              <span
                className="max-w-[130px] truncate text-[10px] font-medium text-slate-600"
                title={batch.facultyName || batch.facultyShortCode}
              >
                {batch.facultyName || batch.facultyShortCode}
              </span>
            </div>
            <p className="truncate text-[9px] text-slate-500">
              {batch.roomName}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DivisionGrid({
  masterData,
  sessions,
  division,
  clashInfo,
  editMode,
  selectedId,
  onSelect,
  onSwap,
  onHint,
  onTogglePin,
  readOnly = false,
}) {
  const divisionSessions = useMemo(
    () => sessions.filter((session) => session.divisionId === division.id),
    [sessions, division.id],
  );
  const { starts, coverage, parallel, occupants: cellOccupants } = useMemo(
    () => buildCoverage(divisionSessions, masterData),
    [divisionSessions, masterData],
  );
  const blocks = useMemo(() => practicalBlocks(masterData), [masterData]);
  const selected = selectedId
    ? divisionSessions.find((session) => session.id === selectedId) ?? null
    : null;

  const handleFilled = (session) => {
    if (!editMode || readOnly) return;
    if (session.type === FIXED_SLOT_TYPE) {
      onHint(
        `“${session.label ?? 'Fixed Slot'}” is a locked Fixed Slot. Change it in Master Data → Fixed Slots.`,
      );
      return;
    }
    if (session.electiveGroup) {
      const selectedSession = divisionSessions.find((item) => item.id === selectedId);
      if (selectedSession && electiveGroupKey(selectedSession) === electiveGroupKey(session)) {
        onSelect(null);
        onHint('');
        return;
      }
      onSelect(session.id);
      const optionsInCell = divisionSessions.filter(
        (item) =>
          electiveGroupKey(item) === electiveGroupKey(session) &&
          item.dayId === session.dayId &&
          item.slotIds.join('|') === session.slotIds.join('|'),
      ).length;
      onHint(
        `Selected the parallel elective group “${session.electiveGroup}” — choose an empty slot to move all ${optionsInCell} options together.`,
      );
      return;
    }
    if (selectedId === session.id) {
      onSelect(null);
      onHint('');
      return;
    }
    if (!selectedId) {
      onSelect(session.id);
      onHint('');
      return;
    }
    const outcome = swapOrMove(sessions, selectedId, { sessionId: session.id }, masterData);
    if (!outcome.ok) {
      onHint(outcome.reason);
      return;
    }
    onSwap(outcome.sessions);
    onSelect(null);
  };

  const handleEmpty = (day, slot) => {
    if (!editMode || readOnly) return;
    if (!selectedId || !selected) {
      onHint('Select a filled session first, then choose its destination.');
      return;
    }

    let targetSlotIds = [slot.id];
    if (selected.type === 'Practical') {
      const block = blocks.find((item) => item.slotIds.includes(slot.id));
      if (!block) {
        onHint('That slot is not part of a valid 2-hour practical block.');
        return;
      }
      const occupants = block.slotIds
        .map((slotId) => coverage.get(`${day.id}|${slotId}`))
        .filter(Boolean);
      const lockedBlock = occupants.find(
        (session) => session.type === FIXED_SLOT_TYPE,
      );
      if (lockedBlock) {
        onHint(
          `That 2-hour block contains the locked Fixed Slot “${lockedBlock.label ?? 'Fixed Slot'}”.`,
        );
        return;
      }
      if (occupants.length > 0) {
        onHint('A practical needs both slots of a 2-hour block to be empty.');
        return;
      }
      targetSlotIds = block.slotIds;
    }

    const outcome = swapOrMove(
      sessions,
      selectedId,
      { dayId: day.id, slotIds: targetSlotIds },
      masterData,
    );
    if (!outcome.ok) {
      onHint(outcome.reason);
      return;
    }
    onSwap(outcome.sessions);
    onSelect(null);
  };

  const renderSessionCell = (session, day, group = null, extras = []) => {
    const isParallel = Array.isArray(group) && group.length > 0;
    const messages = isParallel
      ? [...new Set(group.flatMap((item) => clashInfo.bySession.get(item.id) ?? []))]
      : clashInfo.bySession.get(session.id) ?? [];
    const capacity = capacityWarnings(session, masterData);
    const isSelected =
      editMode &&
      (isParallel
        ? group.some((item) => item.id === selectedId)
        : selectedId === session.id);
    const isPractical = session.type === 'Practical';
    const isFixed = session.type === FIXED_SLOT_TYPE;
    const titleLines = [
      ...messages,
      ...capacity.map((warning) => `Capacity: ${warning}`),
    ];
    if (isParallel) {
      titleLines.unshift(
        ...group.map(
          (item) =>
            `${item.electiveGroup} · ${item.subjectCode} ${item.subjectName} (${item.facultyShortCode}) — ${item.roomName}`,
        ),
      );
    }
    if (titleLines.length === 0) {
      titleLines.push(
        isFixed
          ? `${session.label ?? 'Fixed Slot'} — locked institutional slot`
          : `${session.subjectName ?? session.subjectCode} · ${
              session.facultyShortCode ?? ''
            }`,
      );
    }

    return (
      <td
        key={day.id}
        rowSpan={isPractical || isFixed ? session.slotIds.length : 1}
        className="relative border-b border-l border-slate-200 p-1 align-top"
      >
        <button
          type="button"
          onClick={() => handleFilled(session)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onSelect(null);
              onHint('');
            }
          }}
          aria-pressed={editMode ? isSelected : undefined}
          title={titleLines.join('\n')}
          className={`min-h-20 w-full rounded-lg border p-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
            messages.length > 0
              ? 'border-rose-300 bg-rose-50 ring-1 ring-rose-400'
              : isFixed
                ? 'border-violet-300 bg-violet-50'
                : isParallel
                  ? 'border-indigo-200 bg-indigo-50/60 hover:border-indigo-400'
                  : 'border-slate-200 bg-white hover:border-indigo-300'
          } ${isSelected ? 'border-indigo-400 ring-2 ring-indigo-500' : ''} ${
            isFixed
              ? 'cursor-not-allowed'
              : editMode
                ? 'cursor-pointer'
                : 'cursor-default'
          }`}
        >
          {isParallel ? (
            <ParallelElectiveContent group={group} />
          ) : isPractical ? (
            <PracticalContent session={session} />
          ) : isFixed ? (
            <FixedContent session={session} />
          ) : (
            <TheoryContent session={session} />
          )}
          {extras.length > 0 ? (
            <div className="mt-1 space-y-0.5 border-t border-dashed border-slate-300 pt-1">
              {extras.map((extra) => (
                <p
                  key={extra.id}
                  className="truncate text-[9px] font-semibold text-slate-600"
                  title={`${extra.subjectName ?? extra.subjectCode} · ${
                    extra.facultyShortCode ?? ''
                  } · ${extra.roomName ?? ''}`}
                >
                  {extra.electiveGroup ? `[${extra.electiveGroup}] ` : ''}
                  {extra.subjectCode} · {extra.facultyShortCode}
                </p>
              ))}
            </div>
          ) : null}
          {capacity.length > 0 ? (
            <span
              className="absolute bottom-1 right-1 rounded bg-rose-100 px-1 py-0.5 text-[9px] font-bold text-rose-700"
              title={capacity.join('\n')}
            >
              ⚠ capacity
            </span>
          ) : null}
        </button>
        {onTogglePin && !isFixed && !session.electiveGroup && !readOnly ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin(session.id);
            }}
            aria-pressed={Boolean(session.pinned)}
            aria-label={
              session.pinned
                ? `Unpin ${session.subjectCode} so it can move on regeneration`
                : `Pin ${session.subjectCode} so regeneration keeps it in place`
            }
            title={
              session.pinned
                ? 'Pinned — kept when you regenerate'
                : 'Pin this session so regeneration keeps it here'
            }
            className={`absolute right-1.5 top-1.5 z-10 rounded px-1 py-0.5 text-[10px] leading-none transition ${
              session.pinned
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white/80 text-slate-300 ring-1 ring-inset ring-slate-200 hover:text-indigo-600'
            }`}
          >
            {session.pinned ? '📌' : '☆'}
          </button>
        ) : null}
      </td>
    );
  };

  return (
    <GridTable
      masterData={masterData}
      renderCell={(day, slot, index) => {
        const session = starts.get(`${day.id}|${index}`);
        if (session) {
          const group = session.electiveGroup
            ? parallel.get(
                `${day.id}|${index}|${session.divisionId}|${String(session.electiveGroup).trim()}`,
              )
            : null;
          // Anything else starting in this cell (a second elective group, or a
          // clash) is listed under the primary so it is never hidden.
          const renderedIds = new Set((group ?? [session]).map((item) => item.id));
          const extras = (cellOccupants.get(`${day.id}|${index}`) ?? []).filter(
            (item) => !renderedIds.has(item.id),
          );
          return renderSessionCell(session, day, group, extras);
        }

        // Covered by the rowSpan of a practical that started above.
        if (coverage.has(`${day.id}|${slot.id}`)) return null;

        return (
          <td key={day.id} className="border-b border-l border-slate-200 p-1 align-top">
            <button
              type="button"
              onClick={() => handleEmpty(day, slot)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  onSelect(null);
                  onHint('');
                }
              }}
              aria-label={`Empty slot ${day.label} ${slot.label}`}
              className={`h-20 w-full rounded-lg border border-dashed transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
                editMode
                  ? 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/40'
                  : 'border-slate-100 bg-slate-50/40'
              }`}
            >
              {editMode && selectedId ? (
                <span className="text-[10px] font-medium text-slate-400">Place here</span>
              ) : null}
            </button>
          </td>
        );
      }}
    />
  );
}
