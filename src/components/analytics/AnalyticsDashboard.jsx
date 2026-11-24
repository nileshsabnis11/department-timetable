import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import { getTimetableSnapshot } from '../../utils/exportUtils';
import { usePrintSettings } from '../print/printSettings';
import PrintableAnalytics from '../print/PrintableAnalytics';
import { LOAD_STATUS, buildAnalytics, formatPercent } from './analyticsUtils';
import {
  readSemesterArchive,
  semesterShortLabel,
} from '../../utils/semesterStore';
import { exportAnalyticsWorkbook } from '../../utils/analyticsExport';

const BAR_TONES = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  indigo: 'bg-indigo-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-400',
};

function ProgressBar({ percent, tone = 'indigo', className = '' }) {
  const width = Math.max(0, Math.min(100, Math.round(percent ?? 0)));
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}
      role="img"
      aria-label={`${Math.round(percent ?? 0)} percent`}
    >
      <div
        className={`h-full rounded-full ${BAR_TONES[tone] ?? BAR_TONES.indigo}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function KpiCard({ label, value, caption, tone = 'indigo' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className={`h-1 w-8 rounded-full ${BAR_TONES[tone] ?? BAR_TONES.indigo}`} />
        <p className="text-[11px] text-slate-500">{caption}</p>
      </div>
    </div>
  );
}

function Section({ title, description, actions, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function TrendSection({ rows }) {
  return (
    <Section
      title="Semester comparison"
      description="Utilisation across every saved term. Archived terms are read from their stored snapshot."
      actions={<Badge tone="slate">{rows.length} terms</Badge>}
    >
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 pr-3 font-medium">Semester</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 pr-3 text-center font-medium">Sessions</th>
              <th className="pb-2 pr-3 text-center font-medium">Avg Load</th>
              <th className="pb-2 pr-3 text-center font-medium">Classrooms</th>
              <th className="pb-2 text-center font-medium">Labs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-3 font-medium text-slate-800">{row.label}</td>
                <td className="py-2 pr-3">
                  <Badge tone={row.status === 'Archived' ? 'slate' : 'emerald'}>
                    {row.status}
                  </Badge>
                </td>
                <td className="py-2 pr-3 text-center tabular-nums text-slate-600">
                  {row.sessions}
                </td>
                <td className="py-2 pr-3 text-center tabular-nums text-slate-600">
                  {formatPercent(row.load)}
                </td>
                <td className="py-2 pr-3 text-center tabular-nums text-slate-600">
                  {formatPercent(row.classroom)}
                </td>
                <td className="py-2 text-center tabular-nums text-slate-600">
                  {formatPercent(row.lab)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function utilTone(percent) {
  if (percent > 100) return 'rose';
  if (percent >= 90) return 'amber';
  if (percent >= 60) return 'indigo';
  return 'emerald';
}

export default function AnalyticsDashboard({ masterData }) {
  const [snapshot] = useState(getTimetableSnapshot);
  const sessions = snapshot.sessions ?? [];
  const analytics = useMemo(() => buildAnalytics(masterData, sessions), [masterData, sessions]);
  const { settings } = usePrintSettings();
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const archive = useMemo(() => readSemesterArchive(), []);

  const trendRows = useMemo(
    () =>
      archive
        .map((semester) => {
          const semesterSessions = semester.timetable?.sessions ?? [];
          if (semesterSessions.length === 0) return null;
          const semesterAnalytics = buildAnalytics(semester.masterData, semesterSessions);
          return {
            id: semester.id,
            label: semesterShortLabel(semester),
            status: semester.status,
            sessions: semesterAnalytics.kpis.totalSessions,
            load: semesterAnalytics.kpis.averageLoadPercent,
            classroom: semesterAnalytics.kpis.classroomPercent,
            lab: semesterAnalytics.kpis.labPercent,
          };
        })
        .filter(Boolean),
    [archive],
  );

  const handleExportWorkbook = async () => {
    setExporting(true);
    setExportStatus('');
    try {
      const current = archive.find((item) => item.status === 'Active');
      await exportAnalyticsWorkbook(
        analytics,
        current ? semesterShortLabel(current) : 'Current semester',
        settings.departmentName,
      );
      setExportStatus('Analytics workbook downloaded.');
    } catch (error) {
      setExportStatus(error.message ?? 'Could not export the analytics workbook.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!printing) return undefined;
    // The portal is committed before printing, so the report is in the DOM.
    const reset = () => setPrinting(false);
    window.addEventListener('afterprint', reset, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', reset);
  }, [printing]);

  if (sessions.length === 0) {
    if (trendRows.length === 0) {
      return (
        <EmptyState
          title="No timetable to analyse yet"
          description="Generate a timetable in the Timetable tab first — utilisation, faculty load balance and free lab blocks are calculated from the saved plan."
        />
      );
    }
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            No timetable in the loaded semester yet
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            The comparison below reads the plans already saved in other semesters.
          </p>
        </div>
        <TrendSection rows={trendRows} />
      </div>
    );
  }

  const { kpis } = analytics;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Department snapshot from the saved timetable
          </p>
          <p className="text-xs text-slate-500">
            {snapshot.generatedAt
              ? `Last generated ${new Date(snapshot.generatedAt).toLocaleString()}`
              : 'Read from this browser’s saved plan'}
            {' · '}
            {kpis.totalSessions} teaching sessions
            {kpis.fixedSessions > 0
              ? ` · ${kpis.fixedSessions} locked fixed slot${kpis.fixedSessions === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportWorkbook}
            disabled={exporting}
          >
            {exporting ? 'Preparing…' : 'Export Analytics Excel'}
          </Button>
          <Button size="sm" onClick={() => setPrinting(true)}>
            Print Analytics Report
          </Button>
        </div>
      </div>

      {exportStatus ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600">
          {exportStatus}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Weekly Sessions"
          value={kpis.totalSessions}
          caption={`${kpis.theorySessions} theory · ${kpis.practicalSessions} practical`}
        />
        <KpiCard
          label="Average Faculty Load"
          value={formatPercent(kpis.averageLoadPercent)}
          caption={`${kpis.cappedFacultyCount} faculty with a load cap`}
          tone={kpis.averageLoadPercent > 100 ? 'rose' : 'emerald'}
        />
        <KpiCard
          label="Classroom Utilisation"
          value={formatPercent(kpis.classroomPercent)}
          caption={`${analytics.classrooms.length} rooms × ${analytics.weeklySlots} slots · ${kpis.classroomBooked}/${kpis.classroomCapacity}`}
          tone={utilTone(kpis.classroomPercent)}
        />
        <KpiCard
          label="Lab Utilisation"
          value={formatPercent(kpis.labPercent)}
          caption={`${analytics.labs.length} labs × ${analytics.weeklyBlocks} blocks · ${kpis.labBooked}/${kpis.labCapacity}`}
          tone={utilTone(kpis.labPercent)}
        />
      </div>

      <Section
        title="Faculty load balance"
        description="Weekly contact hours against each member’s maximum load. Locked fixed slots assigned to a faculty member count as contact hours."
        actions={
          <Badge tone={analytics.facultyRows.some((row) => row.status === 'overloaded') ? 'rose' : 'emerald'}>
            {analytics.facultyRows.filter((row) => row.status === 'overloaded').length} overloaded
          </Badge>
        }
      >
        {analytics.facultyRows.length === 0 ? (
          <p className="text-xs text-slate-500">
            No faculty configured — add faculty in Master Data to see load balance.
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Faculty Name (Code)</th>
                  <th className="pb-2 pr-3 text-center font-medium">Theory Hrs</th>
                  <th className="pb-2 pr-3 text-center font-medium">Practical Hrs</th>
                  <th className="pb-2 pr-3 font-medium">Total Hrs</th>
                  <th className="pb-2 pr-3 text-center font-medium">Max Load</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.facultyRows.map((row) => {
                  const status = LOAD_STATUS[row.status] ?? LOAD_STATUS.unknown;
                  return (
                    <tr key={row.id}>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-slate-800">{row.name}</p>
                        <p className="text-[11px] text-slate-400">{row.shortCode || '—'}</p>
                      </td>
                      <td className="py-2 pr-3 text-center tabular-nums text-slate-600">
                        {row.theory}
                      </td>
                      <td className="py-2 pr-3 text-center tabular-nums text-slate-600">
                        {row.practical}
                      </td>
                      <td className="w-40 py-2 pr-3">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold tabular-nums text-slate-800">
                            {row.total}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {row.max > 0 ? `${Math.round(row.percent)}%` : 'no cap'}
                          </span>
                        </div>
                        <ProgressBar
                          percent={row.percent ?? 0}
                          tone={status.tone}
                          className="mt-1"
                        />
                      </td>
                      <td className="py-2 pr-3 text-center tabular-nums text-slate-600">
                        {row.max > 0 ? row.max : '—'}
                      </td>
                      <td className="py-2">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Room & lab occupancy"
        description={`Classrooms are measured against ${analytics.weeklySlots} weekly slots, labs against ${analytics.weeklyBlocks} weekly 2-hour blocks. Free blocks are completely unbooked.`}
        actions={
          <Badge tone="indigo">
            {kpis.freeLabBlocks} free lab blocks
          </Badge>
        }
      >
        {analytics.roomRows.length === 0 ? (
          <p className="text-xs text-slate-500">
            No rooms or labs configured — add them in Master Data to see occupancy.
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Room / Lab Name</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 text-center font-medium">Booked Slots / 36</th>
                  <th className="pb-2 pr-3 text-center font-medium">Free Slots</th>
                  <th className="pb-2 pr-3 font-medium">Utilisation %</th>
                  <th className="pb-2 font-medium">Completely Free 2-Hour Blocks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.roomRows.map((room) => (
                  <tr key={room.id} className="align-top">
                    <td className="py-2 pr-3 font-medium text-slate-800">{room.name}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={room.isLab ? 'emerald' : 'slate'}>{room.type}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-center tabular-nums text-slate-600">
                      {room.booked} / {room.capacity}
                      <span className="block text-[10px] text-slate-400">
                        {room.isLab ? 'blocks' : 'slots'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center tabular-nums text-slate-600">
                      {room.free}
                    </td>
                    <td className="w-36 py-2 pr-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold tabular-nums text-slate-800">
                          {formatPercent(room.percent)}
                        </span>
                      </div>
                      <ProgressBar
                        percent={room.percent}
                        tone={utilTone(room.percent)}
                        className="mt-1"
                      />
                    </td>
                    <td className="py-2">
                      {room.freeBlocks.length === 0 ? (
                        <span className="text-[11px] text-slate-400">Fully booked</span>
                      ) : (
                        <div className="flex max-w-md flex-wrap gap-1">
                          {room.freeBlocks.map((block) => (
                            <span
                              key={`${block.dayId}-${block.slotIds.join('-')}`}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                            >
                              {block.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {trendRows.length > 1 ? <TrendSection rows={trendRows} /> : null}

      {printing && typeof document !== 'undefined'
        ? createPortal(
            <div className="print-root">
              <PrintableAnalytics
                analytics={analytics}
                settings={settings}
                generatedAt={snapshot.generatedAt}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
