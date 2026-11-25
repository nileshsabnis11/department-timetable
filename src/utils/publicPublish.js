/**
 * Phase 5 — Live Read-Only Public Portal Service.
 *
 * Handles publishing the master schedule snapshot from Coordinator mode to
 * the Google Apps Script Web App, and fetching/caching it for the read-only
 * public portal viewed by students and faculty.
 */

export const PUBLIC_CACHE_STORAGE_KEY = 'public_timetable_cache';
export const PUBLISH_PASSCODE_STORAGE_KEY = 'timetable-studio.publish-passcode';
export const SHEETS_URL_STORAGE_KEY = 'timetable-studio.sheets-webapp-url';

function hasStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/**
 * Resolves the Google Apps Script Web App URL:
 * 1. import.meta.env.VITE_APPS_SCRIPT_URL (e.g. deployed on Netlify/Vercel)
 * 2. localStorage saved Apps Script URL from Google Sheets export setting
 */
export function getDefaultScriptUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APPS_SCRIPT_URL) {
    const envUrl = String(import.meta.env.VITE_APPS_SCRIPT_URL).trim();
    if (envUrl) return envUrl;
  }
  if (!hasStorage()) return '';
  try {
    const saved = window.localStorage.getItem(SHEETS_URL_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // storage unavailable
  }
  return '';
}

/** Get the remembered publish passcode for Coordinator convenience. */
export function getSavedPublishKey() {
  if (!hasStorage()) return '';
  try {
    return window.localStorage.getItem(PUBLISH_PASSCODE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/** Save the publish passcode in localStorage. */
export function savePublishKey(key) {
  if (!hasStorage()) return;
  try {
    const trimmed = String(key ?? '').trim();
    if (trimmed) {
      window.localStorage.setItem(PUBLISH_PASSCODE_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(PUBLISH_PASSCODE_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

/** Retrieve the local public cache for instant rendering or offline mode. */
export function getPublicCache() {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PUBLIC_CACHE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.masterData || parsed.timetable) && parsed.status !== 'empty') {
        return parsed;
      }
    }

    // Fallback: If coordinator has master data locally (e.g. on localhost or during initial run),
    // provide an initial snapshot so the portal can be inspected right away.
    const localMd = window.localStorage.getItem('timetable-studio.master-data.v1');
    if (localMd) {
      const masterData = JSON.parse(localMd);
      const localTt = window.localStorage.getItem('timetable-studio.timetable.v1');
      const timetable = localTt ? JSON.parse(localTt) : { sessions: [] };
      const localPs = window.localStorage.getItem('timetable-studio.print-settings.v1');
      const printSettings = localPs
        ? JSON.parse(localPs)
        : {
            societyName: "K.E. Society's",
            instituteName: 'Rajarambapu Institute of Technology, Rajaramnagar',
            departmentName: 'Department of Robotics and Automation',
            termLabel: '2026-27 PART-1',
            revisionInfo: 'Revision No. 01 / Date 27/06/2026',
          };
      return {
        semesterName: 'Current Term',
        printSettings,
        masterData,
        timetable,
        publishedAt: new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Save the public timetable snapshot to localStorage cache. */
export function savePublicCache(data) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(PUBLIC_CACHE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota/storage errors
  }
}

/**
 * Publish the timetable snapshot to the Google Apps Script Web App.
 *
 * @param {object} params
 * @param {string} params.scriptUrl Google Apps Script /exec URL
 * @param {string} params.publishKey Optional passcode protection
 * @param {string} params.semesterName Active semester name
 * @param {object} params.printSettings Institutional header & revision settings
 * @param {object} params.masterData Divisions, rooms, faculty, subjects, timeGrid
 * @param {object} params.timetable Generated timetable sessions
 */
export async function publishLiveTimetable({
  scriptUrl,
  publishKey,
  semesterName,
  printSettings,
  masterData,
  timetable,
}) {
  const targetUrl = (scriptUrl || getDefaultScriptUrl()).trim();
  if (!targetUrl) {
    throw new Error(
      'Apps Script Web App URL is required. Paste your /exec URL in the settings.',
    );
  }
  if (!/^https?:\/\//i.test(targetUrl)) {
    throw new Error('The Apps Script URL must start with https://');
  }

  const publishedAt = new Date().toISOString();
  const payload = {
    action: 'publish',
    publishKey: publishKey ? String(publishKey).trim() : '',
    data: {
      semesterName: semesterName || 'Current Semester',
      printSettings: printSettings || {},
      masterData: masterData || {},
      timetable: timetable || { sessions: [] },
      publishedAt,
    },
  };

  let response;
  try {
    // Use text/plain;charset=utf-8 to prevent CORS preflight check on Google Apps Script
    response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
  } catch (err) {
    throw new Error(
      'Could not reach Google Apps Script Web App. Ensure deployment access is set to "Anyone" and check your internet connection.',
    );
  }

  if (!response.ok) {
    throw new Error(`Publish failed with HTTP status ${response.status}.`);
  }

  const responseText = await response.text().catch(() => '');
  let result = null;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      'Unexpected response from Apps Script. Make sure the Web App is deployed as "Anyone" and returns JSON.',
    );
  }

  if (result?.error || result?.status === 'error') {
    throw new Error(String(result.error || result.message || 'Publish failed.'));
  }

  // Update local public cache immediately so preview loads instantly
  savePublicCache(payload.data);
  if (publishKey) savePublishKey(publishKey);

  return {
    ok: true,
    publishedAt,
    ...result,
  };
}

/**
 * Fetch the live timetable snapshot from Google Apps Script.
 * Falls back to local cache if network is unavailable.
 *
 * @param {string} [scriptUrl] Optional explicit URL
 * @returns {Promise<object>} The published timetable snapshot
 */
export async function fetchLiveTimetable(scriptUrl) {
  const targetUrl = (scriptUrl || getDefaultScriptUrl()).trim();
  const cached = getPublicCache();

  if (!targetUrl) {
    if (cached) return cached;
    throw new Error(
      'No live timetable URL configured and no local cache available.',
    );
  }

  try {
    // Add timestamp to bust any intermediary proxy caches
    const urlObj = new URL(targetUrl);
    urlObj.searchParams.set('_t', Date.now().toString());

    const response = await fetch(urlObj.toString(), {
      method: 'GET',
      redirect: 'follow',
    });

    if (!response.ok) {
      if (cached) return cached;
      throw new Error(`Failed to fetch timetable (HTTP ${response.status}).`);
    }

    const text = await response.text();
    const parsed = JSON.parse(text);

    if (parsed?.error || parsed?.status === 'error' || parsed?.status === 'empty') {
      if (cached && cached.masterData) return cached;
      throw new Error(
        String(parsed.error || parsed.message || 'No live timetable has been published yet.'),
      );
    }

    // Normalise if Apps Script returns { ok: true, data: { ... } } or directly { ... }
    const snapshot = parsed?.data ? parsed.data : parsed;
    if (!snapshot || typeof snapshot !== 'object' || (!snapshot.masterData && !snapshot.timetable)) {
      if (cached && cached.masterData) return cached;
      throw new Error('No live timetable has been published yet.');
    }

    savePublicCache(snapshot);
    return snapshot;
  } catch (err) {
    if (cached) {
      return { ...cached, _isCachedFallback: true };
    }
    throw err;
  }
}

/**
 * Verify a Coordinator passcode before unlocking Coordinator Mode in production.
 * 1. If VITE_COORDINATOR_PASSCODE is set at build time, verifies against it.
 * 2. Otherwise verifies against the Google Apps Script Web App (`action: 'verify'`).
 *
 * @param {string} passcode
 * @param {string} [scriptUrl]
 */
export async function verifyCoordinatorPasscode(passcode, scriptUrl) {
  const trimmed = String(passcode ?? '').trim();
  if (!trimmed) {
    throw new Error('Please enter the coordinator passcode.');
  }

  const envPasscode =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_COORDINATOR_PASSCODE
      ? String(import.meta.env.VITE_COORDINATOR_PASSCODE).trim()
      : '';

  if (envPasscode) {
    if (trimmed === envPasscode) {
      savePublishKey(trimmed);
      return { ok: true };
    }
    throw new Error('Incorrect coordinator passcode.');
  }

  const targetUrl = (scriptUrl || getDefaultScriptUrl()).trim();
  if (!targetUrl) {
    throw new Error(
      'Coordinator login is not configured. Set VITE_COORDINATOR_PASSCODE or VITE_APPS_SCRIPT_URL.',
    );
  }

  let response;
  try {
    response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'verify', publishKey: trimmed }),
      redirect: 'follow',
    });
  } catch {
    throw new Error('Could not reach the verification server. Check your internet connection.');
  }

  if (!response.ok) {
    throw new Error(`Verification failed (HTTP ${response.status}).`);
  }

  const text = await response.text().catch(() => '');
  let result = null;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error('Unexpected response from Apps Script verification endpoint.');
  }

  if (result?.error || result?.status === 'error') {
    throw new Error(String(result.error || result.message || 'Incorrect coordinator passcode.'));
  }

  if (!result?.ok && result?.status !== 'ok' && result?.status !== 'success') {
    throw new Error('Could not verify coordinator passcode.');
  }

  savePublishKey(trimmed);
  return { ok: true };
}

/**
 * Sample Google Apps Script template that supports both:
 * 1. Live Public Timetable publishing/viewing (doGet & doPost action "publish")
 * 2. Google Sheets Multi-Tab Export (doPost sheets payload)
 */
export const APPS_SCRIPT_SAMPLE_CODE = `// ============================================================================
// Google Apps Script: Timetable Studio Live Portal & Sheets Exporter
// Deploy as Web App -> Execute as: "Me" -> Who has access: "Anyone"
// ============================================================================

function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var liveData = props.getProperty('PUBLIC_TIMETABLE');
  
  if (!liveData) {
    return ContentService.createTextOutput(JSON.stringify({
      error: "No live timetable has been published yet."
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(liveData)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var contents = e.postData.contents;
    var payload = JSON.parse(contents);

    // 0. Coordinator Passcode Verification Action
    if (payload.action === 'verify') {
      var props = PropertiesService.getScriptProperties();
      var expectedPasscode = props.getProperty('PUBLISH_KEY');
      if (!expectedPasscode) {
        return ContentService.createTextOutput(JSON.stringify({
          error: "PUBLISH_KEY is not configured in Apps Script Script Properties."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      if (payload.publishKey !== expectedPasscode) {
        return ContentService.createTextOutput(JSON.stringify({
          error: "Incorrect coordinator passcode."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({
        ok: true
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. Live Timetable Publish Action
    if (payload.action === 'publish') {
      var props = PropertiesService.getScriptProperties();
      var expectedPasscode = props.getProperty('PUBLISH_KEY');
      
      // If a passcode is set in Script Properties, enforce it
      if (expectedPasscode && payload.publishKey !== expectedPasscode) {
        return ContentService.createTextOutput(JSON.stringify({
          error: "Invalid publish passcode. Please enter the correct coordinator key."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      props.setProperty('PUBLIC_TIMETABLE', JSON.stringify(payload.data));
      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        publishedAt: payload.data.publishedAt
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Google Sheets Multi-Tab Export
    if (payload.sheets && Array.isArray(payload.sheets)) {
      var ss = SpreadsheetApp.create("College Timetable - " + new Date().toLocaleDateString());
      var firstSheet = true;

      for (var i = 0; i < payload.sheets.length; i++) {
        var sheetData = payload.sheets[i];
        var sheet = firstSheet ? ss.getActiveSheet() : ss.insertSheet(sheetData.name);
        firstSheet = false;
        sheet.setName(sheetData.name);

        if (sheetData.rows && sheetData.rows.length > 0) {
          var numRows = sheetData.rows.length;
          var numCols = Math.max.apply(null, sheetData.rows.map(function(r) { return r.length; }));
          
          var values = [];
          for (var r = 0; r < numRows; r++) {
            var row = sheetData.rows[r];
            while (row.length < numCols) row.push("");
            values.push(row);
          }
          sheet.getRange(1, 1, numRows, numCols).setValues(values);
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        url: ss.getUrl()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      error: "Unknown request payload."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;
