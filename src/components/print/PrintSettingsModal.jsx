import { useEffect, useState } from 'react';
import Button from '../ui/Button';
import {
  DEFAULT_PRINT_SETTINGS,
  normalizePrintSettings,
} from './printSettings';

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

const labelClass = 'mb-1 block text-xs font-medium text-slate-600';

export default function PrintSettingsModal({
  open,
  onClose,
  settings,
  onSave,
  onReset,
  semester = null,
}) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  if (!open) return null;

  const setField = (field) => (event) => {
    setDraft((previous) => ({ ...previous, [field]: event.target.value }));
  };

  const setSignature = (index) => (event) => {
    const value = event.target.value;
    setDraft((previous) => ({
      ...previous,
      signatures: previous.signatures.map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    }));
  };

  const handleReset = () => {
    setDraft(normalizePrintSettings(DEFAULT_PRINT_SETTINGS));
  };

  const followsSemester = !draft.overrideSemesterHeader;

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(
      followsSemester && semester
        ? {
            ...draft,
            academicYear: semester.academicYear,
            semester: `${semester.termType} Semester`,
          }
        : draft,
    );
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-settings-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="print-settings-title" className="text-base font-semibold text-slate-900">
              Print Settings
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              These details appear on every printed A4 landscape timetable and are saved in
              this browser.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close print settings"
            className="rounded-lg p-1 text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="print-society" className={labelClass}>
              Society / Trust Name
            </label>
            <input
              id="print-society"
              type="text"
              value={draft.societyName ?? "K.E. Society's"}
              onChange={setField('societyName')}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="print-revision" className={labelClass}>
              Revision Info
            </label>
            <input
              id="print-revision"
              type="text"
              value={draft.revisionInfo ?? 'Revision No. 01 / Date 27/06/2026'}
              onChange={setField('revisionInfo')}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="print-institute" className={labelClass}>
              Institute Name
            </label>
            <input
              id="print-institute"
              type="text"
              value={draft.instituteName}
              onChange={setField('instituteName')}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="print-department" className={labelClass}>
              Department Name
            </label>
            <input
              id="print-department"
              type="text"
              value={draft.departmentName}
              onChange={setField('departmentName')}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="print-term-label" className={labelClass}>
              Term Label (Part / Academic Session)
            </label>
            <input
              id="print-term-label"
              type="text"
              value={draft.termLabel ?? '2026-27 PART-1'}
              onChange={setField('termLabel')}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            {semester ? (
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={followsSemester}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      overrideSemesterHeader: !event.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="font-medium">Follow the active semester</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    Prints {semester.academicYear} · {semester.termType} Semester. Uncheck to
                    override the header for this semester only.
                  </span>
                </span>
              </label>
            ) : null}
          </div>

          <div>
            <label htmlFor="print-academic-year" className={labelClass}>
              Academic Year
            </label>
            <input
              id="print-academic-year"
              type="text"
              value={
                followsSemester && semester ? semester.academicYear : draft.academicYear
              }
              onChange={setField('academicYear')}
              disabled={followsSemester && Boolean(semester)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="print-semester" className={labelClass}>
              Semester
            </label>
            <input
              id="print-semester"
              type="text"
              value={
                followsSemester && semester ? `${semester.termType} Semester` : draft.semester
              }
              onChange={setField('semester')}
              disabled={followsSemester && Boolean(semester)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="print-wef" className={labelClass}>
              With Effect From (W.E.F.)
            </label>
            <input
              id="print-wef"
              type="date"
              value={draft.wefDate}
              onChange={setField('wefDate')}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <p className="mb-1 text-xs font-medium text-slate-600">Signature Block Labels</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {draft.signatures.map((label, index) => (
                <div key={index}>
                  <label htmlFor={`print-signature-${index}`} className="sr-only">
                    Signature block {index + 1}
                  </label>
                  <input
                    id={`print-signature-${index}`}
                    type="text"
                    value={label}
                    onChange={setSignature(index)}
                    placeholder={DEFAULT_PRINT_SETTINGS.signatures[index]}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={handleReset}>
            Restore defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save settings
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
