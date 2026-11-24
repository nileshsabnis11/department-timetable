import { useEffect, useState } from 'react';
import Button from '../ui/Button';
import {
  buildSheetPayloads,
  getSheetsWebAppUrl,
  getTimetableSnapshot,
  saveSheetsWebAppUrl,
  sendToGoogleSheets,
} from '../../utils/exportUtils';

export default function SheetsExportModal({ open, onClose, masterData, notify }) {
  const [url, setUrl] = useState(getSheetsWebAppUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(getSheetsWebAppUrl());
    setBusy(false);
    setError('');
    setCompleted(false);
    setSheetUrl('');
    setSaved(false);
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    saveSheetsWebAppUrl(url);
    setUrl(getSheetsWebAppUrl());
    setSaved(true);
    notify('Apps Script URL saved.');
    setTimeout(() => setSaved(false), 2200);
  };

  const handleReset = () => {
    saveSheetsWebAppUrl('');
    setUrl('');
    setSaved(false);
    setError('');
    notify('Saved Apps Script URL cleared.');
  };

  const handleExport = async () => {
    const trimmed = url.trim();
    setError('');
    setCompleted(false);
    setSheetUrl('');

    if (!trimmed) {
      setError(
        'Paste your own Apps Script Web App /exec URL — one is not bundled with the app.',
      );
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('Enter a valid Apps Script Web App URL starting with https://.');
      return;
    }

    const snapshot = getTimetableSnapshot();
    if (!snapshot.sessions?.length) {
      setError('Generate a timetable before exporting.');
      return;
    }

    setBusy(true);
    try {
      saveSheetsWebAppUrl(trimmed);
      const result = await sendToGoogleSheets(
        trimmed,
        buildSheetPayloads(masterData, snapshot),
      );
      setCompleted(true);
      setSheetUrl(result.url ?? '');
      notify('Timetable sent to Google Sheets.');
    } catch (err) {
      setError(err.message ?? 'Google Sheets export failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheets-export-title"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="sheets-export-title" className="text-base font-semibold text-slate-900">
              Export to Google Sheets
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Sends division timetables, faculty workload and room utilisation tabs to your
              Apps Script Web App.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close Google Sheets export"
            className="rounded-lg p-1 text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="sheets-url" className="mb-1 block text-xs font-medium text-slate-600">
            Apps Script Web App URL
          </label>
          <input
            id="sheets-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            spellCheck="false"
            placeholder="https://script.google.com/macros/s/…/exec"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Nothing is sent anywhere until you paste a URL. Deploy your own Apps Script as a
            Web App with access “Anyone”, then paste its /exec URL. It is saved only in this
            browser.
          </p>
          {!url.trim() ? (
            <p className="mt-1 text-[11px] font-medium text-amber-700">
              No URL saved yet. Use “Export Excel (.xlsx)” or “Export Backup (JSON)” if you do
              not run an Apps Script.
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        ) : null}

        {completed ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Export completed.
            {sheetUrl ? (
              <>
                {' '}
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline underline-offset-2 hover:text-emerald-900"
                >
                  Open Google Sheet ↗
                </a>
              </>
            ) : (
              ' The script did not return a link to the spreadsheet.'
            )}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={handleReset} disabled={busy || !url}>
            Clear saved URL
          </Button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleSave} disabled={busy}>
              {saved ? 'Saved ✓' : 'Save URL'}
            </Button>
            <Button size="sm" onClick={handleExport} disabled={busy || !url.trim()}>
              {busy ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Exporting…
                </>
              ) : (
                'Export now'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
