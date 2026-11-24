/**
 * Print-header defaults and normalization, shared by the print UI and the
 * semester store. React-free so storage code and Node checks can import it.
 */

export const DEFAULT_PRINT_SETTINGS = Object.freeze({
  societyName: "K.E. Society's",
  instituteName: 'Rajarambapu Institute of Technology, Rajaramnagar',
  departmentName: 'Department of Robotics and Automation',
  termLabel: '2026-27 PART-1',
  revisionInfo: 'Revision No. 01 / Date 27/06/2026',
  academicYear: '2026–27',
  semester: 'Even Semester',
  wefDate: '2027-01-04',
  signatures: ['Timetable Incharge', 'HOD'],
  /** When true the header year/term is edited by hand instead of following the semester. */
  overrideSemesterHeader: false,
});

function textOr(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || fallback;
}

/** Fill missing/blank fields from the defaults so the printed header is never empty. */
export function normalizePrintSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const rawSignatures = Array.isArray(source.signatures) ? source.signatures : [];

  // Default to 2 signatories if empty or default
  const defaultSigs = DEFAULT_PRINT_SETTINGS.signatures;
  const sigCount = Math.max(2, Math.min(3, rawSignatures.length || defaultSigs.length));
  const signatures = [];
  for (let i = 0; i < sigCount; i++) {
    signatures.push(textOr(rawSignatures[i], defaultSigs[i] || ''));
  }

  return {
    societyName: textOr(source.societyName, DEFAULT_PRINT_SETTINGS.societyName),
    instituteName: textOr(source.instituteName, DEFAULT_PRINT_SETTINGS.instituteName),
    departmentName: textOr(
      source.departmentName,
      DEFAULT_PRINT_SETTINGS.departmentName,
    ),
    termLabel: textOr(source.termLabel, DEFAULT_PRINT_SETTINGS.termLabel),
    revisionInfo: textOr(source.revisionInfo, DEFAULT_PRINT_SETTINGS.revisionInfo),
    academicYear: textOr(source.academicYear, DEFAULT_PRINT_SETTINGS.academicYear),
    semester: textOr(source.semester, DEFAULT_PRINT_SETTINGS.semester),
    wefDate:
      typeof source.wefDate === 'string'
        ? source.wefDate
        : DEFAULT_PRINT_SETTINGS.wefDate,
    signatures,
    overrideSemesterHeader: source.overrideSemesterHeader === true,
  };
}
