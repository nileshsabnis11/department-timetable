import { useMemo } from 'react';
import Badge from '../ui/Badge';
import GridTable from './GridTable';
import { roomHours } from './timetableUtils';

function buildRoomEntries(sessions, roomId) {
  const entries = new Map();

  const push = (session, slotId, extra) => {
    const mapKey = `${session.dayId}|${slotId}`;
    if (!entries.has(mapKey)) entries.set(mapKey, []);
    entries.get(mapKey).push({
      key: `${session.id}-${extra.batchId ?? 'theory'}-${slotId}`,
      sessionId: session.id,
      subjectCode: session.subjectCode,
      subjectName: session.subjectName,
      divisionName: session.divisionName,
      facultyShortCode: extra.facultyShortCode,
      batchName: extra.batchName ?? '',
    });
  };

  for (const session of sessions) {
    if (session.type === 'Practical') {
      for (const batch of session.batches ?? []) {
        if (batch.roomId !== roomId) continue;
        for (const slotId of session.slotIds) {
          push(session, slotId, {
            batchId: batch.batchId,
            batchName: batch.batchName,
            facultyShortCode: batch.facultyShortCode,
          });
        }
      }
    } else if (session.roomId === roomId) {
      for (const slotId of session.slotIds) {
        push(session, slotId, { facultyShortCode: session.facultyShortCode });
      }
    }
  }

  return entries;
}

export default function RoomGrid({ masterData, sessions, room, clashInfo }) {
  const entries = useMemo(() => buildRoomEntries(sessions, room.id), [sessions, room.id]);
  const hours = roomHours(sessions, room.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{room.name}</p>
          <p className="text-xs text-slate-500">
            {room.type} · capacity {room.capacity || '—'} · all bookings Mon–Sat
          </p>
        </div>
        <Badge tone="indigo">{hours} hrs utilised</Badge>
      </div>

      <GridTable
        masterData={masterData}
        dense
        renderCell={(day, slot) => {
          const list = entries.get(`${day.id}|${slot.id}`) ?? [];
          return (
            <td key={day.id} className="border-b border-l border-slate-200 p-1 align-top">
              <div className="min-h-14 space-y-1">
                {list.map((entry) => {
                  const messages = clashInfo.bySession.get(entry.sessionId) ?? [];
                  return (
                    <div
                      key={entry.key}
                      title={messages.join('\n')}
                      className={`rounded-lg border px-1.5 py-1 ${
                        messages.length > 0
                          ? 'border-rose-300 bg-rose-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <p className="line-clamp-2 text-[11px] font-bold leading-tight text-slate-900" title={entry.subjectName}>
                        {entry.subjectName}
                      </p>
                      <p className="truncate text-[10px] font-medium text-slate-500">
                        {entry.subjectCode} · {entry.divisionName}
                        {entry.batchName ? ` · ${entry.batchName}` : ''}
                      </p>
                      <p className="truncate text-[10px] text-slate-400">
                        {entry.facultyShortCode}
                      </p>
                    </div>
                  );
                })}
              </div>
            </td>
          );
        }}
      />
    </div>
  );
}
