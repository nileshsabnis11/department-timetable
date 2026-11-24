# Product Requirements Document: Automated College Timetable Generator

## 1. Overview
A web-based timetable generator for an engineering department that automatically creates clash-free weekly schedules for SY and TY divisions (with 4 lab batches each), faculty members, and classrooms/labs, with manual override support and print-ready A4 landscape exports.

## 2. Tech Stack & Architecture
- **Frontend:** React (Vite) + Tailwind CSS
- **Scheduling Engine:** Standalone pure JavaScript/TypeScript module (`src/engine/scheduler.js`) completely decoupled from UI components.
- **Persistence (v1):** Browser `localStorage` + JSON Export/Import backup.
- **Exports:** Print-ready A4 Landscape (`@media print` CSS) and CSV/Excel export.
- **Coding Rule:** Keep code strictly modular. Never overwrite or delete working features when adding new modules.

## 3. Data Models (Master Data)

### A. Time Grid Configuration (Fixed Default, Editable in UI)
- **Working Days:** Monday to Saturday (6 full days).
- **Daily Slots (60 minutes each, 6 teaching slots/day):**
  - **Slot 1:** 10:00 AM – 11:00 AM
  - **Slot 2:** 11:00 AM – 12:00 PM
  - *Lunch Break:* 12:00 PM – 12:45 PM (45 mins — non-teaching)
  - **Slot 3:** 12:45 PM – 1:45 PM
  - **Slot 4:** 1:45 PM – 2:45 PM
  - *Short Recess:* 2:45 PM – 3:00 PM (15 mins — non-teaching)
  - **Slot 5:** 3:00 PM – 4:00 PM
  - **Slot 6:** 4:00 PM – 5:00 PM
- **Valid 2-Hour Practical Blocks:** Only `[Slot 1 + Slot 2]`, `[Slot 3 + Slot 4]`, or `[Slot 5 + Slot 6]`. Practicals must never split across Lunch or Short Recess.

### B. Divisions & Lab Batches
- **Divisions:** `SY` and `TY` (extensible to add more divisions later).
- **Batches per Division:** 4 batches each:
  - SY: `SY-B1`, `SY-B2`, `SY-B3`, `SY-B4`
  - TY: `TY-B1`, `TY-B2`, `TY-B3`, `TY-B4`

### C. Subjects / Courses
- `code`, `name`, `division` (`SY` | `TY`), `type` (`Theory` | `Practical`)
- `weeklyHours`:
  - `Theory`: Single 60-minute slots (e.g., 3 or 4 hours/week).
  - `Practical`: 2 consecutive hours (occupies one full 2-hour block per batch).
- `assignedFaculty`: Faculty ID mapped per subject (and per batch for practicals, if different faculty handle different batches).
- `requiredRoomType`: `Classroom` or specific `Lab`.

### D. Faculty
- `id`, `name`, `shortCode`, `maxWeeklyLoad` (hours).
- `unavailableSlots`: Optional grid of blocked day/slot pairs.

### E. Rooms & Labs
- `id`, `name`, `type` (`Classroom` | `Lab`), `capacity`.
- *Note:* Since each division has 4 parallel lab batches, the sample dataset should include at least 4 labs and 2 classrooms.

## 4. Scheduling Constraints

### Hard Constraints (Zero Tolerance — Must Never Violate)
1. **No Faculty Clash:** A faculty member cannot be scheduled in two places at the same day and slot.
2. **No Room Clash:** A classroom or lab cannot host two sessions simultaneously.
3. **No Division/Batch Clash:** A division cannot have two theory lectures at once, nor a theory lecture overlapping with any of its 4 lab batches.
4. **Strict 2-Hour Practical Blocks:** Every practical must occupy one of the 3 valid blocks (`[Slot 1-2]`, `[Slot 3-4]`, or `[Slot 5-6]`).
5. **Parallel 4-Batch Labs:** When a division (`SY` or `TY`) is assigned a practical block, all 4 batches (`B1`, `B2`, `B3`, `B4`) run their respective practicals in parallel during that same 2-hour block.
6. **Faculty Unavailability:** Respect all blocked day/slot pairs.

### Soft Constraints (Optimisations)
1. **No Faculty Fatigue:** Avoid scheduling 3 or more consecutive teaching hours for any faculty member (especially avoiding back-to-back 2-hour labs).
2. **Daily Spread:** Avoid scheduling the same theory subject twice on the same day for the same division.
3. **Balanced Days:** Distribute theory and practical load evenly across Monday to Saturday.

## 5. Core Features & Views
1. **Master Data Manager:** CRUD forms for Time Grid, Divisions/Batches, Rooms/Labs, Faculty, and Subjects, plus a **"Load Sample Data"** button pre-configured with SY & TY (4 batches each), 2 classrooms, 4 labs, and 8 faculty members.
2. **Generator & Conflict Report:** One-click "Generate Timetable" button. If a 100% schedule is impossible, display a clear human-readable conflict report explaining the exact bottleneck (e.g., *"Cannot place TY-B3 Lab: Lab 2 is full across all available blocks"*).
3. **Multi-View Timetable Grid:** Toggle seamlessly between:
   - **Division View** (SY / TY — displaying Lunch & Short Recess rows clearly, and showing all 4 batches stacked neatly inside 2-hour practical blocks)
   - **Faculty-wise View** (with total weekly load summary)
   - **Room / Lab Utilisation View**
4. **Manual Edit & Live Clash Detection:** Click any two slots to swap them. Immediately highlight any resulting faculty, room, or batch clash in red with a tooltip explaining the conflict.
5. **Print-Ready A4 Landscape Layout:** Clean `@media print` styling with institute/department header, semester details, timetable grid, subject-faculty legend table, and signature blocks (Timetable Coordinator, HOD, Principal).

## 6. Phased Delivery Plan
- **Phase 1:** Project scaffolding + Master Data Manager UI + Sample Data Loader (SY & TY, 4 batches, exact 10:00–5:00 grid) + `localStorage` persistence.
- **Phase 2:** Standalone `scheduler.js` engine (Backtracking / Constraint Satisfaction) + automated clash-verification script.
- **Phase 3:** Interactive Timetable Grid (Division/Faculty/Room views) + Manual Swap with live clash alerts.
- **Phase 4:** Print-ready A4 Landscape CSS + JSON/CSV Export & Import.