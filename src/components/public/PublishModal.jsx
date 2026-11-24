import { useEffect, useState } from 'react';
import Button from '../ui/Button';
import {
  APPS_SCRIPT_SAMPLE_CODE,
  getDefaultScriptUrl,
  getSavedPublishKey,
  publishLiveTimetable,
  savePublicCache,
  savePublishKey,
} from '../../utils/publicPublish';
import { getTimetableSnapshot, saveSheetsWebAppUrl } from '../../utils/exportUtils';
import { loadPrintSettings } from '../print/printSettings';

export default function PublishModal({ open, onClose, masterData, semester, notify }) {
  const [scriptUrl, setScriptUrl] = useState(getDefaultScriptUrl);
  const [publishKey, setPublishKey] = useState(getSavedPublishKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [publishedInfo, setPublishedInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScriptUrl(getDefaultScriptUrl());
    setPublishKey(getSavedPublishKey());
    setBusy(false);
    setError('');
    setCopied(false);
  }, [open]);

  if (!open) return null;

  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const publicUrl = isLocalhost
    ? `${window.location.origin}/?view=public`
    : `${window.location.origin}/`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      if (notify) notify('Public link copied to clipboard!');
    } catch {
      // fallback
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_SAMPLE_CODE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
      if (notify) notify('Apps Script code copied to clipboard!');
    } catch {
      // fallback
    }
  };

  const handlePublish = async () => {
    const trimmedUrl = scriptUrl.trim();
    setError('');

    if (!trimmedUrl) {
      setError('Please provide your Google Apps Script Web App /exec URL.');
      return;
    }
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setError('The Web App URL must start with https://');
      return;
    }

    const timetable = getTimetableSnapshot();
    if (!timetable?.sessions?.length) {
      setError('Please generate a timetable before publishing to the live portal.');
      return;
    }

    setBusy(true);
    try {
      // Persist the URL and passcode in localStorage for convenience
      saveSheetsWebAppUrl(trimmedUrl);
      savePublishKey(publishKey);

      const result = await publishLiveTimetable({
        scriptUrl: trimmedUrl,
        publishKey: publishKey.trim(),
        semesterName: semester?.name || 'Active Semester',
        printSettings: loadPrintSettings(),
        masterData,
        timetable,
      });

      setPublishedInfo(result);
      if (notify) notify('Live timetable website updated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to publish live timetable.');
    } finally {
      setBusy(false);
    }
  };

  const handleLocalPublish = () => {
    try {
      const timetable = getTimetableSnapshot();
      const printSettings = loadPrintSettings();
      const snapshot = {
        semesterName: semester?.name || 'Active Semester',
        printSettings: printSettings || {},
        masterData: masterData || {},
        timetable: timetable || { sessions: [] },
        publishedAt: new Date().toISOString(),
      };
      savePublicCache(snapshot);
      setPublishedInfo({ ok: true, publishedAt: snapshot.publishedAt });
      if (notify) notify('Saved to local portal cache! Preview is now ready.');
    } catch (err) {
      setError(err.message || 'Failed to save local cache.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-modal-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="my-8 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-lg">
              🌐
            </div>
            <div>
              <h3 id="publish-modal-title" className="text-base font-bold text-slate-900">
                Publish to Live Public Portal
              </h3>
              <p className="text-xs text-slate-500">
                Instantly deploy the current timetable to the student &amp; faculty read-only website.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Success Alert Banner with Quick Links */}
        {publishedInfo ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <p className="text-xs font-bold text-emerald-900">
                Published Successfully!
              </p>
              <span className="ml-auto text-[10px] text-emerald-700">
                {new Date(publishedInfo.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="mt-1 text-xs text-emerald-800">
              Students and faculty can now access the schedule directly at your public URL:
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <div className="flex-1 truncate rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-800">
                {publicUrl}
              </div>
              <Button size="sm" variant="secondary" onClick={handleCopyLink}>
                {copied ? '✓ Copied' : 'Copy Link'}
              </Button>
              <Button
                size="sm"
                onClick={() => window.open(publicUrl, '_blank')}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Preview Site ↗
              </Button>
            </div>
          </div>
        ) : null}

        {/* Inputs */}
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Google Apps Script Web App URL <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              value={scriptUrl}
              onChange={(e) => setScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Shared with Google Sheets export. Deployment must be accessible to &ldquo;Anyone&rdquo;.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Publish Passcode <span className="text-slate-400 font-normal">(Optional security key)</span>
            </label>
            <input
              type="password"
              value={publishKey}
              onChange={(e) => setPublishKey(e.target.value)}
              placeholder="Leave blank or enter coordinator key"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Matches <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">PUBLISH_KEY</code> if configured in your Apps Script Properties.
            </p>
          </div>
        </div>

        {/* Error message */}
        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <strong>Error:</strong> {error}
          </div>
        ) : null}

        {/* Apps Script Code Helper Accordion */}
        <div className="mt-5 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            <span>{showCode ? '▾ Hide' : '▸ Need the Google Apps Script backend code?'}</span>
          </button>

          {showCode ? (
            <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-700">Code.gs (Apps Script)</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="rounded bg-white px-2 py-1 text-[10px] font-medium text-slate-700 border border-slate-300 hover:bg-slate-100"
                >
                  {copiedCode ? '✓ Copied' : 'Copy Code'}
                </button>
              </div>
              <pre className="max-h-48 overflow-y-auto rounded bg-slate-900 p-2.5 font-mono text-[10px] text-slate-200">
                {APPS_SCRIPT_SAMPLE_CODE}
              </pre>
            </div>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={handleLocalPublish}
            disabled={busy}
            title="Saves current schedule to browser cache so you can preview the portal instantly without Apps Script"
            className="text-xs"
          >
            ⚡ Test / Local Preview
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Close
            </Button>
            <Button
              onClick={handlePublish}
              disabled={busy || !scriptUrl.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {busy ? 'Publishing…' : 'Publish / Update Live Website'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
