// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────

let store = {};
let allTasks = [];
let selectedDate = todayStr();

const timer = {
  running: false, taskId: null, taskTitle: null,
  jiraId: null, startTs: null, entryId: null,
};
let timerInterval = null;
let pendingStartTs = null;

const PX_PER_MIN = 1.5;
const schedState = { rangeStartMs: 0, pxPerMin: PX_PER_MIN };
let schedTickCount = 0;

// ─────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────

async function loadStore() {
  try {
    var timeout = new Promise(function(res) { setTimeout(function() { res(null); }, 3000); });
    var raw = await Promise.race([PluginAPI.loadSyncedData(), timeout]);
    if (raw === null) { dbg('loadSyncedData TIMED OUT — store empty', 'error'); store = {}; return; }
    store = raw ? JSON.parse(raw) : {};
    dbg('loadStore OK, keys: [' + (Object.keys(store).join(', ') || '(none)') + ']', 'ok');
  } catch (e) { store = {}; dbg('loadStore ERROR: ' + e.message, 'error'); }
}

let saveTimer = null;
function scheduleSave(immediate) {
  clearTimeout(saveTimer);
  if (immediate) { persistNow(); return; }
  saveTimer = setTimeout(persistNow, 500);
}
async function persistNow() {
  try { await PluginAPI.persistDataSynced(JSON.stringify(store)); } catch (_) {}
}

function getDayLog(d) { return store['daily-log-' + d] || { date: d, entries: [] }; }
function getEntries(d) { return getDayLog(d).entries || []; }
function saveEntries(d, entries) { store['daily-log-' + d] = { date: d, entries }; scheduleSave(); }
function getPinned() { return store['pinned-tasks'] || []; }
function savePinned(ids) { store['pinned-tasks'] = ids; scheduleSave(); }
function getJiraCfg() { return store['jira-config'] || null; }
function saveJiraCfg(cfg) { store['jira-config'] = cfg; scheduleSave(true); }

var _myJiraKeys = new Set();
var _sectionCollapsed = { today: false, assigned: false, other: false };

async function fetchJiraAssigned() {
  var cfg = getJiraCfg();
  if (!cfg || !cfg.baseUrl || !cfg.email || !cfg.apiToken) {
    dbg('fetchJiraAssigned: no Jira config — skipped', 'warn');
    return;
  }
  dbg('fetchJiraAssigned: calling ' + cfg.baseUrl + ' as ' + cfg.email, 'info');
  try {
    var jql = 'assignee=currentUser() AND resolution=Unresolved';
    var url = cfg.baseUrl + '/rest/api/3/search/jql?jql=' + encodeURIComponent(jql) + '&fields=key&maxResults=200';
    var res = await fetch(url, {
      headers: { 'Authorization': 'Basic ' + btoa(cfg.email + ':' + cfg.apiToken) }
    });
    if (!res.ok) {
      var body = await res.text().catch(function() { return ''; });
      dbg('fetchJiraAssigned HTTP ' + res.status + ': ' + body.slice(0, 120), 'error');
      return;
    }
    var data = await res.json();
    _myJiraKeys = new Set((data.issues || []).map(function(i) { return i.key; }));
    dbg('fetchJiraAssigned: ' + _myJiraKeys.size + ' issues assigned to me (total in Jira: ' + (data.total || '?') + ')', 'ok');
    renderTodayTasks();
  } catch(e) { dbg('fetchJiraAssigned error: ' + e.message, 'error'); }
}

async function detectSpJiraConfig() {
  try {
    var db = await new Promise(function(resolve, reject) {
      var req = indexedDB.open('SUP_OPS');
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error); };
    });
    var state = await new Promise(function(resolve, reject) {
      var tx  = db.transaction('state_cache', 'readonly');
      var req = tx.objectStore('state_cache').get('current');
      req.onsuccess = function() { resolve(req.result && req.result.state); };
      req.onerror   = function() { reject(req.error); };
    });
    db.close();
    if (!state || !state.issueProvider) return null;
    var entities = state.issueProvider.entities;
    var jiraProvider = Object.values(entities).find(function(p) {
      return p && p.issueProviderKey === 'JIRA' && p.isEnabled && p.host;
    });
    if (!jiraProvider) return null;
    return { baseUrl: jiraProvider.host, email: jiraProvider.userName || '', apiToken: jiraProvider.password || '' };
  } catch(e) {
    dbg('detectSpJiraConfig failed: ' + e.message, 'warn');
    return null;
  }
}
function getPinSettings() { return Object.assign({ layout: 'compact', label: 'tag' }, store['pin-settings'] || {}); }
function savePinSettings(s) { store['pin-settings'] = s; scheduleSave(); }
const PX_PER_MIN_BASE = 1.5;
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3];
function getSchedSettings() { return Object.assign({ zoomIdx: 2, fontSize: 9, panelWidth: 248 }, store['sched-settings'] || {}); }
function saveSchedSettings(s) { store['sched-settings'] = s; scheduleSave(); }
function currentPxPerMin() { var ss = getSchedSettings(); return PX_PER_MIN_BASE * ZOOM_LEVELS[ss.zoomIdx]; }
