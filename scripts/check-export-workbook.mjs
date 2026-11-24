/**
 * Round-trip check for the Excel export.
 *
 * Bundles the real export module with esbuild (it uses extensionless Vite
 * imports), generates a timetable from the sample department, captures the
 * downloaded blob, reloads it with ExcelJS and asserts the workbook structure.
 *
 * Run with: npm run check:export
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import ExcelJS from 'exceljs';

const root = process.cwd();
const workDir = path.join(root, '.tmp-export-check');
const entryPath = path.join(workDir, 'entry.mjs');
const bundlePath = path.join(workDir, 'bundle.mjs');

const captured = { blob: null, download: '' };

let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function sheetText(sheet) {
  const parts = [];
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value != null) parts.push(String(cell.value));
    });
  });
  return parts.join('\n');
}

await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });
await writeFile(
  entryPath,
  [
    "export { createSampleMasterData } from '../src/data/sampleData.js';",
    "export { generateTimetable } from '../src/engine/scheduler.js';",
    "export { exportWorkbook } from '../src/utils/exportUtils.js';",
  ].join('\n'),
);

await build({
  entryPoints: [entryPath],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: bundlePath,
  logLevel: 'warning',
});

globalThis.Blob = class Blob {
  constructor(parts) {
    this.parts = parts;
  }
};

globalThis.document = {
  body: { appendChild() {} },
  createElement() {
    const element = {};
    Object.defineProperty(element, 'href', {
      set(value) {
        captured.href = value;
      },
    });
    Object.defineProperty(element, 'download', {
      set(value) {
        captured.download = value;
      },
    });
    element.click = () => {};
    element.remove = () => {};
    return element;
  },
};

globalThis.URL.createObjectURL = (blob) => {
  captured.blob = blob;
  return 'blob:check';
};
globalThis.URL.revokeObjectURL = () => {};

const { createSampleMasterData, generateTimetable, exportWorkbook } = await import(
  `${pathToFileURL(bundlePath).href}?t=${Date.now()}`
);

const masterData = createSampleMasterData();
const generated = generateTimetable(masterData);
if (!generated?.timetable?.sessions?.length) {
  console.error('Generator produced no sessions; cannot check the workbook.');
  process.exit(1);
}

const baseline = JSON.parse(JSON.stringify(generated.timetable.sessions));
const sessions = JSON.parse(JSON.stringify(generated.timetable.sessions));

// Simulate one theory substitution: the session id stays, faculty changes.
const substitute = masterData.faculty[1];
const theory = sessions.find(
  (session) => session.type === 'Theory' && session.facultyId !== substitute.id,
);
if (theory) {
  theory.facultyId = substitute.id;
  theory.facultyShortCode = substitute.shortCode;
  theory.facultyName = substitute.name;
}

console.log('Full workbook');
await exportWorkbook(
  masterData,
  { sessions, baseline, generatedAt: new Date().toISOString() },
  { fileName: 'check-workbook' },
);

const full = new ExcelJS.Workbook();
await full.xlsx.load(captured.blob.parts[0]);
check('file name honours the option', captured.download === 'check-workbook.xlsx', captured.download);

const names = full.worksheets.map((sheet) => sheet.name);
check('master tab first', names[0] === 'Master Timetable (A3)', names.join(', '));
check(
  'division tabs present',
  masterData.divisions.every((division) => names.includes(`${division.name} Timetable`)),
);
check(
  'faculty tabs present',
  masterData.faculty.every((member) => names.some((name) => name.startsWith('Fac - '))),
);
check(
  'room tabs present',
  names.filter((name) => name.startsWith('Room - ')).length === masterData.rooms.length,
  names.join(', '),
);
check('health tab present', names.includes('Schedule Health'));
check(
  'health tab reports utilisation',
  sheetText(full.getWorksheet('Schedule Health')).includes('Room utilisation'),
);
check(
  'summaries last',
  names.slice(-2).join('|') === 'Faculty Workload|Room Utilisation',
  names.slice(-3).join(', '),
);

const master = full.getWorksheet('Master Timetable (A3)');
check('master is A3 landscape', master.pageSetup.paperSize === 8, String(master.pageSetup.paperSize));
check('master fits one page wide', master.pageSetup.fitToWidth === 1);
check('master fits one page tall', master.pageSetup.fitToHeight === 1);
check(
  'master carries the W.E.F. date',
  sheetText(master).includes('W.E.F.'),
);
check(
  'master carries a signature block',
  sheetText(master).includes('Timetable Coordinator'),
);
check(
  'master footer has page numbers',
  String(master.headerFooter?.oddFooter ?? '').includes('Page &P of &N'),
);
check('master practicals merged', (master.model?.merges ?? []).length > 0);

const divisionSheet = full.getWorksheet(`${masterData.divisions[0].name} Timetable`);
check('division tab is A4 landscape', divisionSheet.pageSetup.paperSize === 9);
check('division tab fits one page', divisionSheet.pageSetup.fitToWidth === 1);
check(
  'division tab has the legend',
  sheetText(divisionSheet).includes('Subject–Faculty Legend'),
);
check(
  'division tab has the title block',
  sheetText(divisionSheet).includes('Academic Year'),
);
check(
  'substitution is traceable',
  full.worksheets.some((sheet) => sheetText(sheet).includes('sub for')),
);
check(
  'faculty load header rendered',
  full.worksheets.some((sheet) => sheetText(sheet).includes('Scheduled / Max Load')),
);
check(
  'room tab shows occupancy',
  full.worksheets.some((sheet) => sheetText(sheet).includes('Booked / Capacity')),
);

console.log('Options: divisions + summaries only');
await exportWorkbook(
  masterData,
  { sessions, baseline },
  {
    includeMaster: false,
    includeFaculty: false,
    includeRooms: false,
    includeHealth: false,
    use24h: true,
  },
);

const trimmed = new ExcelJS.Workbook();
await trimmed.xlsx.load(captured.blob.parts[0]);
const trimmedNames = trimmed.worksheets.map((sheet) => sheet.name);
check(
  'filtered tabs only',
  trimmedNames.length === masterData.divisions.length + 2,
  trimmedNames.join(', '),
);
check(
  'no master when unchecked',
  !trimmedNames.includes('Master Timetable (A3)'),
);
check(
  'no faculty tabs when unchecked',
  !trimmedNames.some((name) => name.startsWith('Fac - ')),
);
check(
  '24-hour labels used',
  trimmedNames.some((name) => sheetText(trimmed.getWorksheet(name)).includes('10:00–11:00')),
);
check(
  'default file name is descriptive',
  /^timetable-.*-\d{4}-\d{2}-\d{2}\.xlsx$/.test(captured.download),
  captured.download,
);

await rm(workDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll Excel export checks passed.');
