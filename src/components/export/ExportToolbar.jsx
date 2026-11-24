import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import { Field, Select, TextInput } from '../ui/inputs';
import ExcelExportModal from './ExcelExportModal';
import ExportToast from './ExportToast';
import SheetsExportModal from './SheetsExportModal';
import {
  applyBackup,
  downloadJsonBackup,
  exportWorkbook,
  getTimetableSnapshot,
  parseBackupJson,
} from '../../utils/exportUtils';
import { downloadCalendar } from '../../utils/calendarExport';
import { loadPrintSettings } from '../print/printSettings';
import { importSemester, loadSemesterState } from '../../utils/semesterStore';

const modalClass =
  'fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4';

export default function ExportToolbar({ masterData, readOnly = false }) {
  const fileInputRef = useRef(null);
  const newSemesterInputRef = useRef(null);
  const toastTimer = useRef(null);
  const [toast, setToast] = useState(null);
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarScope, setCalendarScope] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const [pendingBackup, setPendingBackup] = useState(null);
  const [importDraft, setImportDraft] = useState({ academicYear: '', termType: 'Odd' });

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === 'error' ? 7000 : 4000);
  }, []);

  const handleExportJson = () => {
    try {
      downloadJsonBackup(masterData, getTimetableSnapshot());
      notify('Backup downloaded.');
    } catch (error) {
      notify(error.message ?? 'Could not create the backup.', 'error');
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const backup = parseBackupJson(text);
      const confirmed = window.confirm(
        'Replace the current Master Data and timetable with this backup? This cannot be undone. Use "Import as New Semester" to keep the current term intact.',
      );
      if (!confirmed) return;

      applyBackup(backup);
      // Reload straight away: the still-mounted stores would otherwise write
      // their pre-import state back over the restored data.
      window.location.reload();
    } catch (error) {
      notify(error.message ?? 'Could not import that backup.', 'error');
    }
  };

  const handleNewSemesterFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const backup = parseBackupJson(await file.text());
      setPendingBackup(backup);
      setImportDraft({ academicYear: '', termType: 'Odd' });
      setImportOpen(true);
    } catch (error) {
      notify(error.message ?? 'Could not read that backup.', 'error');
    }
  };

  const confirmImportSemester = () => {
    const year = importDraft.academicYear.trim();
    if (!pendingBackup || !year) return;
    try {
      const settings = loadPrintSettings();
      importSemester(loadSemesterState(), {
        masterData: pendingBackup.masterData,
        timetable: pendingBackup.timetable,
        academicYear: year,
        termType: importDraft.termType,
        printSettings: {
          ...settings,
          academicYear: year,
          semester: `${importDraft.termType} Semester`,
        },
      });
      setImportOpen(false);
      window.location.reload();
    } catch (error) {
      notify(error.message ?? 'Could not import that backup as a semester.', 'error');
    }
  };

  const handleCalendar = () => {
    const snapshot = getTimetableSnapshot();
    if (!snapshot.sessions?.length) {
      notify('Generate a timetable before exporting a calendar.', 'error');
      return;
    }
    const [kind, id] = calendarScope.split(':');
    try {
      const faculty = masterData.faculty.find((member) => member.id === id);
      const events = downloadCalendar(masterData, snapshot.sessions, {
        facultyId: kind === 'fac' ? id : undefined,
        facultyName: faculty?.name,
        divisionId: kind === 'div' ? id : undefined,
        settings: loadPrintSettings(),
      });
      setCalendarOpen(false);
      notify(`Calendar exported — ${events} weekly events.`);
    } catch (error) {
      notify(error.message ?? 'Could not build the calendar file.', 'error');
    }
  };

  const handleExcel = async (options = {}) => {
    const snapshot = getTimetableSnapshot();
    if (!snapshot.sessions?.length) {
      notify('Generate a timetable before exporting.', 'error');
      return;
    }

    setExportingExcel(true);
    try {
      await exportWorkbook(masterData, snapshot, options);
      setExcelOpen(false);
      notify('Excel workbook downloaded.');
    } catch (error) {
      notify(error.message ?? 'Could not build the Excel workbook.', 'error');
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={handleExportJson}>
          Export Backup (JSON)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={readOnly}
          title={readOnly ? 'Archived semester — read-only' : undefined}
        >
          Import Backup (JSON)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => newSemesterInputRef.current?.click()}
          disabled={readOnly}
          title={readOnly ? 'Archived semester — read-only' : undefined}
        >
          Import as New Semester
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setCalendarOpen(true)}
        >
          Export Calendar (.ics)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setExcelOpen(true)}
          disabled={exportingExcel}
        >
          {exportingExcel ? 'Preparing…' : 'Export Excel (.xlsx)'}
        </Button>
        <Button size="sm" onClick={() => setSheetsOpen(true)}>
          Export to Google Sheets
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFile}
        />
        <input
          ref={newSemesterInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleNewSemesterFile}
        />
      </div>

      <ExcelExportModal
        open={excelOpen}
        onClose={() => setExcelOpen(false)}
        onExport={handleExcel}
        busy={exportingExcel}
      />
      <SheetsExportModal
        open={sheetsOpen}
        onClose={() => setSheetsOpen(false)}
        masterData={masterData}
        notify={notify}
      />

      {calendarOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-export-title"
          className={modalClass}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCalendarOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 id="calendar-export-title" className="text-base font-semibold text-slate-900">
              Export Calendar (.ics)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Weekly recurring events from the timetable's W.E.F. date, for Google Calendar,
              Outlook or Apple Calendar.
            </p>
            <div className="mt-4">
              <Field label="What to export">
                <Select
                  value={calendarScope}
                  onChange={(event) => setCalendarScope(event.target.value)}
                  aria-label="Calendar export scope"
                >
                  <option value="all">Whole department</option>
                  {masterData.divisions.map((division) => (
                    <option key={division.id} value={`div:${division.id}`}>
                      Division {division.name}
                    </option>
                  ))}
                  {masterData.faculty.map((member) => (
                    <option key={member.id} value={`fac:${member.id}`}>
                      {member.shortCode} — {member.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setCalendarOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCalendar}>
                Download .ics
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen && pendingBackup ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-semester-title"
          className={modalClass}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setImportOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 id="import-semester-title" className="text-base font-semibold text-slate-900">
              Import Backup as a New Semester
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              The backup becomes its own semester with its own Master Data and timetable. The
              term you are working on now is left unchanged.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Academic Year">
                <TextInput
                  value={importDraft.academicYear}
                  onChange={(event) =>
                    setImportDraft((previous) => ({
                      ...previous,
                      academicYear: event.target.value,
                    }))
                  }
                  placeholder="2025–26"
                  autoFocus
                />
              </Field>
              <Field label="Term">
                <Select
                  value={importDraft.termType}
                  onChange={(event) =>
                    setImportDraft((previous) => ({
                      ...previous,
                      termType: event.target.value,
                    }))
                  }
                >
                  <option value="Odd">Odd</option>
                  <option value="Even">Even</option>
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={confirmImportSemester}
                disabled={!importDraft.academicYear.trim()}
              >
                Import as Semester
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ExportToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
