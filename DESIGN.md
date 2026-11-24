# Timetable Studio — Design System & UI Specification

`DESIGN.md` is the authoritative visual and UX design system specification for **Timetable Studio**, a high-density, automated academic scheduling platform for engineering colleges and university departments.

---

## 1. Product Identity & Design Ethos

### 1.1 Product Mission
Timetable Studio transforms the high-friction, error-prone chore of academic timetable creation into an intuitive, high-speed, and constraint-verified engineering workflow. It bridges mathematical constraint satisfaction (no teacher in two places, no lab over-capacity, balanced workload) with real-world institutional presentation (print-ready A3/A4 formats and live web grids).

### 1.2 Design Philosophy: "Institutional Precision & Modern Clarity"
- **Information Density without Chaos:** Department coordinators manage 40+ teachers, 16+ batches, and hundreds of weekly hours. Data must be dense, tabular, aligned, and readable at a glance without unnecessary whitespace inflation.
- **Immediate State Feedback:** Conflicts, room shortages, and faculty load overruns must immediately surface with distinct visual cues (amber warning vs. rose critical conflict).
- **Physical–Digital Symmetry:** What coordinators view on-screen must seamlessly reflect how it prints on an A3 Master sheet or A4 faculty workload document.
- **Tactile Ergonomics:** Subtle borders, distinct card surfaces, micro-interactions for drag/drop and pinning, and tabular-numeric typography.

---

## 2. Color System & Semantic Palette

The color system is calibrated for institutional authority (deep slates, clean neutrals) accented by purposeful semantic tokens that map directly to academic domains.

### 2.1 Base Neutrals & Surfaces
```css
--surface-canvas:       #F8FAFC; /* Slate 50 - background canvas */
--surface-card:         #FFFFFF; /* Pure White - primary cards, modals, grids */
--surface-subtle:       #F1F5F9; /* Slate 100 - row zebra, slot headers, disabled */
--surface-border:       #E2E8F0; /* Slate 200 - structural borders */
--surface-border-strong:#CBD5E1; /* Slate 300 - interactive inputs, active card edges */

--text-primary:         #0F172A; /* Slate 900 - titles, primary labels, codes */
--text-secondary:       #475569; /* Slate 600 - metadata, faculty names, rooms */
--text-muted:           #94A3B8; /* Slate 400 - empty states, timestamps */
```

### 2.2 Academic Domain Tokens
```css
/* Theory Lectures */
--theory-surface:       #FFFFFF;
--theory-border:        #E2E8F0;
--theory-text:          #1E293B;

/* 2-Hour Practical Laboratory Blocks */
--practical-surface:    #EFF6FF; /* Soft Blue 50 */
--practical-border:     #BFDBFE; /* Blue 200 */
--practical-text:       #1E3A8A; /* Blue 900 */
--practical-accent:     #3B82F6; /* Blue 500 */

/* Breaks (Lunch & Recess) */
--break-surface:        #FEF3C7; /* Soft Amber 100 */
--break-border:         #FDE68A; /* Amber 200 */
--break-text:           #92400E; /* Amber 800 */
--break-icon:           #D97706; /* Amber 600 */

/* Hard Constraints & Clashes */
--clash-surface:        #FEF2F2; /* Rose 50 */
--clash-border:         #FECDD3; /* Rose 200 */
--clash-text:           #9F1239; /* Rose 800 */
--clash-accent:         #E11D48; /* Rose 600 */

/* Load Feasibility / Success */
--success-surface:      #ECFDF5; /* Emerald 50 */
--success-border:       #A7F3D0; /* Emerald 200 */
--success-text:         #065F46; /* Emerald 800 */
```

---

## 3. Typography & Numerical Layout

### 3.1 Typeface Selection
- **Primary Interface Font:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`.
- **Numerical & Code Font:** `Inter` with OpenType `tabular-nums` (`font-variant-numeric: tabular-nums`). Essential for slot times (`10:00 – 11:00`), batch indicators (`SY-B1`), and load meters (`18 / 20 hrs`).

### 3.2 Type Scale & Hierarchy
| Level | Size / Line Height | Weight | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Display Header** | `24px` / `32px` | Semibold (`600`) | `-0.02em` | App Title, Export Dialog Titles |
| **Section Header** | `18px` / `24px` | Semibold (`600`) | `-0.01em` | Master Data category titles, Grid division titles |
| **Card Header** | `14px` / `20px` | Semibold (`600`) | `0` | Subject code, Session title in timetable cell |
| **Body Primary** | `13px` / `18px` | Regular / Medium | `0` | Form labels, Division/Room names |
| **Tabular Meta** | `11px` / `16px` | Medium (`500`) | `0` | Time intervals, Faculty short codes, Room numbers |
| **Micro Badge** | `10px` / `14px` | Bold (`700`) | `+0.05em` | Status chips, "THEORY", "PRAC", "LUNCH" |

---

## 4. UI Architecture & Spatial Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│ App Header: Brand (TS) │ Institutional Meta │ Quick Actions (Sample/Reset) │
├────────────────────────────────────────────────────────────────────────┤
│ View Switcher Tabs: [ Master Data (5 subtabs) ] | [ Timetable Studio ]  │
│                                           [ Export Hub (.xlsx / PDF) ] │
├────────────────────────────────────────────────────────────────────────┤
│ ACTIVE VIEW AREA                                                       │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Controls Toolbar: Division Picker | View Mode | Generator | Clashes  │ │
│ ├────────────────────────────────────────────────────────────────────┤ │
│ │ Timetable Grid Matrix                                              │ │
│ │  - Frozen Day / Time headers                                       │ │
│ │  - Horizontally merged 2-hr practicals                             │ │
│ │  - Soft amber vertical breaks                                      │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Master Data Manager Layout
- **Tab Navigation:** Horizontal pill list with icons: `Time Grid`, `Divisions`, `Rooms & Labs`, `Faculty & Loads`, `Subjects & Practical Batches`.
- **Bulk CSV Importer:** Top drawer accessible on every subtab with instant column mapping preview and error audit banner.
- **Inline Editing & Fast Keyboard Ergonomics:** Enter to save, Esc to cancel, Tab to next field.

### 4.2 Timetable Studio Grid Layout
- **Multi-Perspective Navigation Bar:**
  1. `Class / Division View` (e.g., FY, SY, TY, Final Year)
  2. `Faculty Schedule View` (inspect individual teacher workload and free periods)
  3. `Room / Lab Occupancy View` (prevent lab scheduling over-commitments)
  4. `All-in-One Master Grid` (synchronized overview of entire college department)
- **Cell Component Structure:**
  - Subject Code in bold 12px pill
  - Subject Name truncated to 1 line with tooltip
  - Bottom strip: Faculty shortcode badge (`AKP`) + Room tag (`L2`)
  - Practical card displays batch breakdown columns (`B1: L1 · AKP | B2: L2 · SVD`)

---

## 5. Component Style Guide

### 5.1 Buttons & Interactive Controls
- **Primary:** `bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm px-4 py-2 transition`
- **Secondary:** `border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg px-3 py-1.5`
- **Danger:** `border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium rounded-lg px-3 py-1.5`
- **Pill Badges:** `rounded-full px-2 py-0.5 text-xs font-semibold`

### 5.2 Conflict & Warning Banners
- **Soft warning:** `bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 shadow-xs`
- **Blocking conflict:** `bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3 shadow-xs`
- Each conflict item includes a one-click action: `View Clash` or `Suggest Substitute`.

### 5.3 Export Hub Modal
- Dedicated modal showcasing print-ready outputs:
  1. **Excel Multi-tab Department Workbook (.xlsx):**
     - Master Timetable (A3 Landscape)
     - Classwise Timetables (A4 Landscape)
     - Faculty Schedules (A4 Landscape)
     - Summary Workload & Utilization
  2. **Official PDF Document:** Browser print integration formatted with institutional seals and 3-tier signatory blocks.
  3. **Google Sheets Sync:** Instant push to Google Drive.

---

## 6. Micro-Interactions & Animation

- **Transitions:** `transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1)`.
- **Hover Elevation:** Hovering over timetable sessions elevates the cell slightly (`translate-y-[-1px] shadow-sm ring-1 ring-slate-300`).
- **Conflict Pulse:** Discovered clashes subtly pulse with a soft rose outline rather than disruptive modal popups.
- **Generation Progress:** Clean, indeterminate linear bar during search calculation with step count and elapsed millisecond counter.
