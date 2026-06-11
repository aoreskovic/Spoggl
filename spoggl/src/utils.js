// ─────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function tsToHHMM(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function msToHHMMSS(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

function msToDur(ms) {
  ms = Math.max(0, ms);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function parseDur(str) {
  str = str.trim().toLowerCase();
  let ms = 0;
  const hm = str.match(/(\d+(?:\.\d+)?)\s*h/);
  const mm = str.match(/(\d+)\s*m(?!s)/);
  if (hm) ms += parseFloat(hm[1]) * 3600000;
  if (mm) ms += parseInt(mm[1]) * 60000;
  return ms > 0 ? ms : null;
}

function parseHHMM(str) {
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1]), min = parseInt(m[2]);
  if (h > 23 || min > 59) return null;
  return [h, min];
}

function hhmmToTs(hhmm, dateStr) {
  const p = parseHHMM(hhmm);
  if (!p) return null;
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(p[0], p[1], 0, 0);
  return d.getTime();
}

function jiraTs(ts) {
  const d   = new Date(ts);
  const off = -d.getTimezoneOffset();
  const s   = off >= 0 ? '+' : '-';
  const a   = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000` +
         `${s}${pad(Math.floor(a / 60))}${pad(a % 60)}`;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────
// DEBUG
// ─────────────────────────────────────────

var _dbgEntries = [];
var _dbgOpen    = true;

function dbg(msg, type) {
  type = type || 'info';
  var now = new Date();
  var ts  = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) +
            '.' + String(now.getMilliseconds()).padStart(3, '0');
  _dbgEntries.push({ ts: ts, msg: msg, type: type });

  var log = document.getElementById('dbg-log');
  if (log) {
    // Remove placeholder if present
    var empty = log.querySelector('.dbg-empty');
    if (empty) log.removeChild(empty);

    var row = document.createElement('div');
    row.className = 'dbg-row dbg-' + type;
    row.innerHTML = '<span class="dbg-ts">' + ts + '</span><span class="dbg-msg">' + String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>';
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  var cnt = document.getElementById('dbg-count');
  if (cnt) cnt.textContent = _dbgEntries.length;
}

function _dbgDumpState() {
  dbg('--- STATE DUMP ---', 'state');
  dbg('allTasks: ' + allTasks.length + ' loaded', 'state');
  dbg('timer.running: ' + timer.running, 'state');
  if (timer.running) {
    dbg('  taskTitle: ' + timer.taskTitle, 'state');
    dbg('  jiraId: ' + timer.jiraId, 'state');
    dbg('  startTs: ' + (timer.startTs ? new Date(timer.startTs).toLocaleTimeString() : 'null'), 'state');
  }
  dbg('selectedDate: ' + selectedDate, 'state');
  dbg('store keys: ' + Object.keys(store).join(', '), 'state');
  dbg('entries today: ' + getEntries(selectedDate).length, 'state');
  if (allTasks.length > 0) {
    dbg('first task: ' + allTasks[0].title + ' | projectId:' + allTasks[0].projectId + ' | dueDay:' + allTasks[0].dueDay + ' | tagIds:' + JSON.stringify(allTasks[0].tagIds), 'state');
  }
  // Dump PluginAPI surface so we know what's available
  try {
    var api = window.PluginAPI;
    var methods = Object.getOwnPropertyNames(api).filter(function(k) { return typeof api[k] === 'function'; });
    dbg('PluginAPI methods: ' + methods.join(', '), 'state');
    var hooks = api.Hooks ? Object.keys(api.Hooks).join(', ') : '(no Hooks obj)';
    dbg('PluginAPI.Hooks: ' + hooks, 'state');
  } catch(e) { dbg('PluginAPI dump error: ' + e, 'state'); }
  dbg('SP actions seen: ' + Array.from(_spActionTypes).join(', '), 'state');
  dbg('--- END DUMP ---', 'state');
}

var _spActionTypes = new Set();

function _dbgCopy() {
  var text = _dbgEntries.map(function(e) { return '[' + e.ts + '][' + e.type + '] ' + e.msg; }).join('\n');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function() { _dbgCopyFallback(text); });
    } else { _dbgCopyFallback(text); }
  } catch(_) { _dbgCopyFallback(text); }
}
function _dbgCopyFallback(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch(_) {}
  document.body.removeChild(ta);
}

// Confirm script is running immediately
dbg('Script parsed. PluginAPI = ' + typeof PluginAPI, typeof PluginAPI === 'object' ? 'ok' : 'error');

// Catch any uncaught JS errors into the debug panel
window.onerror = function(msg, src, line, col, err) {
  dbg('UNCAUGHT ERROR line ' + line + ': ' + msg, 'error');
  return false;
};
window.addEventListener('unhandledrejection', function(e) {
  dbg('UNHANDLED REJECTION: ' + ((e.reason && e.reason.message) || String(e.reason)), 'error');
});

// Wire debug buttons after DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('dbg-bar').addEventListener('click', function() {
    _dbgOpen = !_dbgOpen;
    document.getElementById('dbg-log').style.display = _dbgOpen ? '' : 'none';
    document.getElementById('dbg-toggle-lbl').textContent = _dbgOpen ? '▼' : '▶';
  });
  document.getElementById('dbg-state-btn').addEventListener('click', function(e) {
    e.stopPropagation(); _dbgDumpState();
  });
  document.getElementById('dbg-copy-btn').addEventListener('click', function(e) {
    e.stopPropagation(); _dbgCopy();
    dbg('Log copied to clipboard', 'ok');
  });
  document.getElementById('dbg-clear-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    _dbgEntries = [];
    document.getElementById('dbg-log').innerHTML = '<div class="dbg-empty">Cleared.</div>';
    document.getElementById('dbg-count').textContent = '0';
  });
});

// ─────────────────────────────────────────
// THEME
// ─────────────────────────────────────────

function applyTheme() {
  var dark = false;
  try {
    // Try reading SP parent frame's background colour
    var bg = getComputedStyle(window.parent.document.body).backgroundColor;
    var m  = bg.match(/\d+/g);
    if (m && m.length >= 3) {
      dark = (parseInt(m[0]) * 299 + parseInt(m[1]) * 587 + parseInt(m[2]) * 114) / 1000 < 128;
    }
  } catch(_) {
    dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.documentElement.classList.toggle('dark', dark);
  dbg('Theme: ' + (dark ? 'dark' : 'light'), 'ok');
}
