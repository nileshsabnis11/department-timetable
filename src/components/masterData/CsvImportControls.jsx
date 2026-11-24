import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import {
  buildFacultyTemplateCsv,
  buildRoomsTemplateCsv,
  buildSubjectTemplateCsv,
  downloadCsv,
  parseFacultyRows,
  parseRoomRows,
  parseSubjectRows,
  readImportFile,
} from '../../utils/csvImport';

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function CsvPreviewModal({
  kind,
  preview,
  collisions,
  onCancel,
  onApply,
}) {
  if (!preview) return null;

  const isFaculty = kind === 'faculty';
  const isRooms = kind === 'rooms';
  const label = isFaculty ? 'faculty' : isRooms ? 'rooms & labs' : 'subjects';
  const title = isFaculty ? 'Faculty' : isRooms ? 'Rooms & Labs' : 'Subjects';
  const hasRows = preview.validRows.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-preview-title"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 id="csv-preview-title" className="text-base font-semibold text-slate-900">
              Import {title} CSV
            </h3>
            <p className="mt-0.5 truncate text-xs text-slate-500">{preview.fileName}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close import preview"
            className="rounded-lg p-1 text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <p className="text-xl font-semibold tabular-nums text-emerald-800">
                {preview.validRows.length}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                Valid rows ready
              </p>
            </div>
            <div
              className={`rounded-xl border px-3 py-2.5 ${
                preview.errors.length > 0
                  ? 'border-rose-200 bg-rose-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <p
                className={`text-xl font-semibold tabular-nums ${
                  preview.errors.length > 0 ? 'text-rose-700' : 'text-slate-500'
                }`}
              >
                {preview.errors.length}
              </p>
              <p
                className={`text-[11px] font-medium uppercase tracking-wide ${
                  preview.errors.length > 0 ? 'text-rose-600' : 'text-slate-400'
                }`}
              >
                Rows with errors
              </p>
            </div>
          </div>

          {(isFaculty || isRooms) && collisions > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {plural(collisions, isRooms ? 'room name' : 'short code')} already{' '}
              {collisions === 1 ? 'exists' : 'exist'}. Append will skip them; Replace All
              will replace the current {label} list.
            </div>
          ) : null}

          {preview.errors.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-rose-700">
                Fix these rows before importing:
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-rose-100 bg-rose-50/60 p-2.5">
                {preview.errors.map((error, index) => (
                  <li
                    key={`${error.rowNumber}-${index}`}
                    className="text-[11px] leading-relaxed text-rose-800"
                  >
                    <span className="font-semibold">Row {error.rowNumber}:</span>{' '}
                    {error.message}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Invalid rows are skipped. Valid rows can still be imported.
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-700">
              All rows passed validation.
            </p>
          )}

          {!hasRows ? (
            <p className="text-xs font-medium text-rose-600">
              There are no valid rows to import.
            </p>
          ) : null}

          <p className="text-[11px] leading-relaxed text-slate-400">
            Replace All removes the current {label} list. Append keeps it and adds the valid
            rows.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onApply('append')}
            disabled={!hasRows}
          >
            Append to Existing
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => onApply('replace')}
            disabled={!hasRows}
          >
            Replace All
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CsvImportControls({
  kind,
  existingRows = [],
  divisions = [],
  faculty = [],
  onChange,
}) {
  const fileInputRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState(null);
  const isFaculty = kind === 'faculty';
  const isRooms = kind === 'rooms';

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const keyFor = (row) =>
    String((isFaculty ? row.shortCode : row.name) ?? '').trim().toLowerCase();
  const existingKeys = new Set(
    (isFaculty || isRooms ? existingRows : []).map(keyFor).filter(Boolean),
  );
  const collisions =
    preview && (isFaculty || isRooms)
      ? preview.validRows.filter((row) => existingKeys.has(keyFor(row))).length
      : 0;

  const handleTemplate = () => {
    try {
      if (isFaculty) {
        downloadCsv('faculty-template.csv', buildFacultyTemplateCsv());
      } else if (isRooms) {
        downloadCsv('rooms-template.csv', buildRoomsTemplateCsv());
      } else {
        downloadCsv(
          'subjects-template.csv',
          buildSubjectTemplateCsv({ divisions, faculty }),
        );
      }
    } catch (error) {
      setToast({ tone: 'error', message: error.message ?? 'Could not download the template.' });
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setReading(true);
    try {
      const rows = await readImportFile(file);
      const result = isFaculty
        ? parseFacultyRows(rows, existingRows)
        : isRooms
          ? parseRoomRows(rows, existingRows)
          : parseSubjectRows(rows, {
              faculty,
              divisions,
              existingSubjects: existingRows,
            });
      setPreview({ ...result, fileName: file.name });
    } catch (error) {
      setToast({
        tone: 'error',
        message: error.message ?? 'Could not read that file.',
      });
    } finally {
      setReading(false);
    }
  };

  const handleApply = (mode) => {
    if (!preview) return;

    const { validRows, errors } = preview;
    let rowsToAdd = validRows;
    let skippedExisting = 0;

    if ((isFaculty || isRooms) && mode === 'append') {
      rowsToAdd = validRows.filter((row) => !existingKeys.has(keyFor(row)));
      skippedExisting = validRows.length - rowsToAdd.length;
    }

    const nextRows =
      mode === 'replace' ? rowsToAdd : [...existingRows, ...rowsToAdd];
    onChange(nextRows);

    const singular = isFaculty
      ? 'faculty member'
      : isRooms
        ? 'room/lab'
        : 'subject';
    const pluralForm = isFaculty
      ? 'faculty members'
      : isRooms
        ? 'rooms/labs'
        : 'subjects';
    const skipNoun = isRooms ? 'existing room name' : 'existing short code';
    const parts = [`Imported ${plural(rowsToAdd.length, singular, pluralForm)}.`];
    if (skippedExisting > 0) {
      parts.push(`Skipped ${plural(skippedExisting, skipNoun)}.`);
    }
    if (errors.length > 0) {
      parts.push(`Ignored ${plural(errors.length, 'invalid row')}.`);
    }
    if (rowsToAdd.length === 0) {
      parts.length = 0;
      parts.push(
        skippedExisting > 0
          ? `No new ${pluralForm} imported — ${plural(
              skippedExisting,
              isRooms ? 'room name' : 'short code',
            )} already ${skippedExisting === 1 ? 'exists' : 'exist'}.`
          : `No ${pluralForm} imported.`,
      );
    }

    setPreview(null);
    setToast({ tone: 'success', message: parts.join(' ') });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={handleTemplate}>
          Download Template (.csv)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={reading}
        >
          {reading ? 'Reading…' : 'Import CSV'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      <CsvPreviewModal
        kind={kind}
        preview={preview}
        collisions={collisions}
        onCancel={() => setPreview(null)}
        onApply={handleApply}
      />

      {toast ? (
        <div
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-4 right-4 z-[60] flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            toast.tone === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <span className="leading-snug">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className={`rounded p-0.5 text-base leading-none transition ${
              toast.tone === 'error'
                ? 'text-rose-400 hover:text-rose-700'
                : 'text-emerald-500 hover:text-emerald-800'
            }`}
          >
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
