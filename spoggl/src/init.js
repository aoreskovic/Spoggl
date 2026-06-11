// ─────────────────────────────────────────
// TASKS LOADER (non-blocking, with timeout)
// ─────────────────────────────────────────

function loadTasks() {
  var resolved = false;
  dbg('loadTasks() → calling PluginAPI.getTasks()…');

  function done(tasks, src) {
    if (resolved) return;
    resolved = true;
    allTasks = (Array.isArray(tasks) && tasks.length > 0) ? tasks : [];
    dbg('getTasks ' + (src || '') + ' → ' + allTasks.length + ' tasks', allTasks.length > 0 ? 'ok' : 'warn');
    if (allTasks.length > 0) {
      dbg('  sample[0]: "' + allTasks[0].title + '" projectId=' + allTasks[0].projectId + ' dueDay=' + allTasks[0].dueDay + ' tagIds=' + JSON.stringify(allTasks[0].tagIds));
    }
    renderTodayTasks();
    renderPins();
    if (allTasks.length === 0) {
      dbg('empty — retry in 3s…', 'warn');
      setTimeout(function() {
        dbg('retry getTasks()…');
        try {
          PluginAPI.getTasks().then(function(t) {
            if (Array.isArray(t) && t.length > 0) {
              allTasks = t;
              dbg('retry OK → ' + allTasks.length + ' tasks', 'ok');
              renderTodayTasks(); renderPins();
            } else { dbg('retry still empty', 'warn'); }
          }).catch(function(e) { dbg('retry ERROR: ' + e.message, 'error'); });
        } catch(e) { dbg('retry THROW: ' + e.message, 'error'); }
      }, 3000);
    }
  }

  var timeout = setTimeout(function() {
    dbg('getTasks() TIMED OUT after 5s — proceeding without tasks', 'error');
    done([], 'timeout');
  }, 5000);

  try {
    PluginAPI.getTasks()
      .then(function(t) { clearTimeout(timeout); done(t, 'resolved'); })
      .catch(function(e) { clearTimeout(timeout); dbg('getTasks ERROR: ' + e.message, 'error'); done([], 'error'); });
  } catch(e) {
    clearTimeout(timeout);
    dbg('getTasks() THROW: ' + e.message, 'error');
    done([], 'error');
  }
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────

function applySchedFontSize(size) {
  document.querySelectorAll('.sched-entry-label').forEach(function(el) {
    el.style.fontSize = size + 'px';
  });
  // Store as CSS variable so future renders also use it
  document.documentElement.style.setProperty('--sched-font-size', size + 'px');
}
function updateZoomLabel() {
  var ss = getSchedSettings();
  var lbl = document.getElementById('zoom-lbl');
  if (lbl) lbl.textContent = ZOOM_LEVELS[ss.zoomIdx] + '×';
}

async function init() {
  dbg('init() start — PluginAPI type: ' + typeof PluginAPI);
  // 1. Load persisted data (required for crash-recovery, fast)
  await loadStore();

  // Auto-detect SP's native Jira config if we don't have one yet
  if (!(store['jira-config'] && store['jira-config'].baseUrl)) {
    var _detected = await detectSpJiraConfig();
    if (_detected) {
      store['jira-config'] = _detected;
      scheduleSave();
      dbg('Auto-detected SP Jira config: ' + _detected.baseUrl, 'ok');
    }
  }

  // Fetch Jira issues assigned to current user (non-blocking)
  fetchJiraAssigned();

  // 2. Detect and apply theme
  applyTheme();

  // 3. Crash-recovery: restore running timer
  var saved = store['timer-state'];
  if (saved && saved.running && saved.taskId) {
    Object.assign(timer, saved);
    applyTimerUI();
    clearInterval(timerInterval);
    timerInterval = setInterval(tickTimer, 1000);
    tickTimer();
  }

  // 4. Render UI immediately — NO await before this point for tasks
  dbg('selectDate + renderPins…');
  selectDate(todayStr());
  renderPins();
  document.getElementById('today-task-list').innerHTML =
    '<div style="padding:12px;text-align:center;font-size:13px;color:#9e9e9e">Loading tasks…</div>';
  document.getElementById('today-tasks-count').textContent = '…';
  dbg('UI rendered, wiring listeners…', 'ok');

  // 4. Scroll schedule to now
  setTimeout(schedScrollToNow, 200);

  // 5. Load tasks non-blocking — resolves independently of UI setup
  loadTasks();

  // ── Event listeners ──

  var taskInp = document.getElementById('task-input');
  taskInp.addEventListener('input', function() {
    selectedTask = null;
    showDropdown(searchTasks(taskInp.value));
  });
  taskInp.addEventListener('focus', function() {
    if (!timer.running) showDropdown(searchTasks(taskInp.value));
  });
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.task-search-wrap'))
      document.getElementById('task-dropdown').classList.add('hidden');
    if (!e.target.closest('.ctx-menu'))
      hideCtxMenu();
  });

  // Today & Inbox toggle
  document.getElementById('today-tasks-toggle').addEventListener('click', function() {
    document.getElementById('today-task-list').classList.toggle('hidden');
  });

  var startInp = document.getElementById('start-time-input');
  startInp.addEventListener('blur', function() {
    if (!timer.running) {
      var ts = hhmmToTs(startInp.value, todayStr());
      if (ts && ts <= Date.now()) { pendingStartTs = ts; }
      else { startInp.value = ''; pendingStartTs = null; }
    } else {
      var ts2 = hhmmToTs(startInp.value, selectedDate);
      if (ts2 && ts2 <= Date.now()) {
        timer.startTs = ts2; store['timer-state'] = Object.assign({}, timer); scheduleSave();
      } else {
        startInp.value = tsToHHMM(timer.startTs);
        PluginAPI.showSnack({ msg: 'Start time cannot be in the future', type: 'WARNING' });
      }
    }
  });
  startInp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') startInp.blur();
    if (e.key === 'Escape') { startInp.value = timer.running ? tsToHHMM(timer.startTs) : ''; startInp.blur(); }
  });

  document.getElementById('start-stop-btn').addEventListener('click', function() {
    if (timer.running) { stopTimer(); return; }
    if (selectedDate !== todayStr()) return;

    var taskId, taskTitle, jiraId;
    if (selectedTask) {
      taskId = selectedTask.id; taskTitle = selectedTask.title; jiraId = taskJiraId(selectedTask);
    } else {
      var raw = taskInp.value.trim();
      if (!raw) { PluginAPI.showSnack({ msg: 'Select a task before starting', type: 'WARNING' }); return; }
      var m = raw.match(/\(([A-Z][A-Z0-9_]+-\d+)\)\s*$/);
      jiraId = m ? m[1] : null;
      taskTitle = m ? raw.replace(/\s*\([^)]+\)\s*$/, '').trim() : raw;
      taskId = 'custom-' + Date.now();
    }
    startTimer(taskId, taskTitle, jiraId);
  });

  document.getElementById('prev-day').addEventListener('click', function() { selectDate(addDays(selectedDate, -1)); });
  document.getElementById('next-day').addEventListener('click', function() { if (selectedDate < todayStr()) selectDate(addDays(selectedDate, 1)); });
  document.getElementById('today-btn').addEventListener('click', function() { selectDate(todayStr()); });

  document.getElementById('finish-day-btn').addEventListener('click', finishDay);

  // Settings open
  document.getElementById('settings-btn').addEventListener('click', function() {
    var ps  = getPinSettings();
    var ss  = getSchedSettings();
    var cfg = getJiraCfg() || {};
    var layoutEl = document.getElementById('pin-layout-' + ps.layout);
    if (layoutEl) layoutEl.checked = true;
    var labelEl  = document.getElementById('pin-label-'  + ps.label);
    if (labelEl)  labelEl.checked = true;
    var fsEl = document.getElementById('sched-fontsize');
    if (fsEl) fsEl.value = String(ss.fontSize);
    document.getElementById('cfg-url').value   = cfg.baseUrl   || '';
    document.getElementById('cfg-email').value = cfg.email     || '';
    document.getElementById('cfg-token').value = cfg.apiToken  || '';
    document.getElementById('settings-overlay').classList.remove('hidden');
  });
  document.getElementById('save-cfg').addEventListener('click', function() {
    var cfg = {
      baseUrl:  document.getElementById('cfg-url').value.trim().replace(/\/$/, ''),
      email:    document.getElementById('cfg-email').value.trim(),
      apiToken: document.getElementById('cfg-token').value.trim(),
    };
    if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) {
      try { PluginAPI.showSnack({ msg: 'Fill in all Jira fields', type: 'WARNING' }); } catch(_) {}
      return;
    }
    saveJiraCfg(cfg);
    fetchJiraAssigned();
    document.getElementById('settings-overlay').classList.add('hidden');
    try { PluginAPI.showSnack({ msg: 'Jira config saved', type: 'SUCCESS' }); } catch(_) {}
  });
  document.getElementById('jira-detect-btn').addEventListener('click', async function() {
    var detected = await detectSpJiraConfig();
    if (detected) {
      document.getElementById('cfg-url').value   = detected.baseUrl;
      document.getElementById('cfg-email').value = detected.email;
      document.getElementById('cfg-token').value = detected.apiToken;
      dbg('Jira config detected from SP — click Save to apply', 'ok');
    } else {
      try { PluginAPI.showSnack({ msg: 'No enabled Jira provider found in SP', type: 'WARNING' }); } catch(_) {}
    }
  });
  document.getElementById('jira-test-btn').addEventListener('click', async function() {
    var baseUrl = document.getElementById('cfg-url').value.trim().replace(/\/$/, '');
    var email   = document.getElementById('cfg-email').value.trim();
    var token   = document.getElementById('cfg-token').value.trim();
    if (!baseUrl || !email || !token) {
      try { PluginAPI.showSnack({ msg: 'Fill in all Jira fields first', type: 'WARNING' }); } catch(_) {}
      return;
    }
    var btn = document.getElementById('jira-test-btn');
    btn.textContent = 'Testing…';
    btn.disabled = true;
    try {
      var res = await fetch(baseUrl + '/rest/api/3/myself', {
        headers: { 'Authorization': 'Basic ' + btoa(email + ':' + token), 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        var me = await res.json();
        var name = me.displayName || me.emailAddress || 'OK';
        try { PluginAPI.showSnack({ msg: 'Connected as ' + name, type: 'SUCCESS' }); } catch(_) {}
        dbg('Jira test OK: ' + name, 'ok');
      } else {
        try { PluginAPI.showSnack({ msg: 'Jira error ' + res.status, type: 'ERROR' }); } catch(_) {}
        dbg('Jira test FAIL ' + res.status, 'error');
      }
    } catch(e) {
      try { PluginAPI.showSnack({ msg: 'Connection failed: ' + e.message, type: 'ERROR' }); } catch(_) {}
      dbg('Jira test ERROR: ' + e.message, 'error');
    }
    btn.textContent = 'Test connection';
    btn.disabled = false;
  });
  document.getElementById('close-cfg').addEventListener('click', function() {
    document.getElementById('settings-overlay').classList.add('hidden');
  });
  document.getElementById('settings-overlay').addEventListener('click', function(e) {
    if (e.target === document.getElementById('settings-overlay'))
      document.getElementById('settings-overlay').classList.add('hidden');
  });
  // Pin settings — live apply
  document.querySelectorAll('input[name="pin-layout"], input[name="pin-label"]').forEach(function(r) {
    r.addEventListener('change', function() {
      var ps = getPinSettings();
      var l  = document.querySelector('input[name="pin-layout"]:checked');
      var lb = document.querySelector('input[name="pin-label"]:checked');
      if (l)  ps.layout = l.value;
      if (lb) ps.label  = lb.value;
      savePinSettings(ps); renderPins();
    });
  });
  // Font size — live apply
  document.getElementById('sched-fontsize').addEventListener('change', function() {
    var ss = getSchedSettings();
    ss.fontSize = parseInt(this.value);
    saveSchedSettings(ss);
    applySchedFontSize(ss.fontSize);
  });

  // Zoom buttons
  document.getElementById('zoom-in').addEventListener('click', function() {
    var ss = getSchedSettings();
    if (ss.zoomIdx < ZOOM_LEVELS.length - 1) { ss.zoomIdx++; saveSchedSettings(ss); safeRenderSchedule(); updateZoomLabel(); }
  });
  document.getElementById('zoom-out').addEventListener('click', function() {
    var ss = getSchedSettings();
    if (ss.zoomIdx > 0) { ss.zoomIdx--; saveSchedSettings(ss); safeRenderSchedule(); updateZoomLabel(); }
  });

  // Panel resize
  var resizeHandle = document.getElementById('sched-resize-handle');
  var rightPanel   = document.getElementById('right-panel');
  resizeHandle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    var startX     = e.clientX;
    var startWidth = rightPanel.offsetWidth;
    resizeHandle.classList.add('resizing');
    function onMove(me) {
      rightPanel.style.width = Math.max(160, Math.min(560, startWidth - (me.clientX - startX))) + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      resizeHandle.classList.remove('resizing');
      var ss = getSchedSettings(); ss.panelWidth = rightPanel.offsetWidth; saveSchedSettings(ss);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Apply saved schedule settings on load
  (function() {
    var ss = getSchedSettings();
    if (ss.panelWidth) rightPanel.style.width = ss.panelWidth + 'px';
    applySchedFontSize(ss.fontSize);
    updateZoomLabel();
  })();

  // Pin search
  document.getElementById('add-pin-btn').addEventListener('click', function() {
    document.getElementById('pin-search-input').value = '';
    renderPinSearch('');
    document.getElementById('pin-overlay').classList.remove('hidden');
    document.getElementById('pin-search-input').focus();
  });
  document.getElementById('close-pin').addEventListener('click', function() {
    document.getElementById('pin-overlay').classList.add('hidden');
  });
  document.getElementById('pin-overlay').addEventListener('click', function(e) {
    if (e.target === document.getElementById('pin-overlay'))
      document.getElementById('pin-overlay').classList.add('hidden');
  });
  document.getElementById('pin-search-input').addEventListener('input', function(e) { renderPinSearch(e.target.value); });

  document.getElementById('schedule-grid').addEventListener('click', onScheduleGridClick);

  // ── Register SP hooks (must run after PluginAPI is available) ──
  try {
    PluginAPI.registerHook(PluginAPI.Hooks.PERSISTED_DATA_CHANGED, async function() {
      dbg('HOOK: PERSISTED_DATA_CHANGED');
      await loadStore();
      var s = store['timer-state'];
      if (s && s.running && s.taskId && !timer.running) {
        Object.assign(timer, s);
        applyTimerUI();
        clearInterval(timerInterval);
        timerInterval = setInterval(tickTimer, 1000);
        tickTimer();
      } else if ((!s || !s.running) && timer.running) {
        clearInterval(timerInterval); timerInterval = null;
        Object.assign(timer, { running: false, taskId: null, taskTitle: null, jiraId: null, startTs: null, entryId: null });
        document.getElementById('timer-display').textContent = '00:00:00';
        document.getElementById('timer-display').classList.remove('running');
        document.getElementById('start-time-input').value = '';
        var b2 = document.getElementById('start-stop-btn');
        b2.textContent = '▶ Start'; b2.classList.remove('btn-stop'); b2.classList.add('btn-primary');
        document.getElementById('status-bar').classList.add('hidden');
      }
      renderTodayTasks(); renderTimeline(); renderPins(); updateTotal();
    });
    dbg('PERSISTED_DATA_CHANGED hook registered', 'ok');

    PluginAPI.registerHook(PluginAPI.Hooks.ACTION, function(action) {
      var atype = action && action.type ? action.type : '?';
      if (!_spActionTypes.has(atype)) {
        _spActionTypes.add(atype);
        dbg('SP ACTION (new): ' + atype + (action.id ? ' id=' + action.id : ''), 'warn');
      }
      try {
        PluginAPI.getTasks().then(function(t) {
          if (Array.isArray(t) && t.length > 0) {
            var prev = allTasks.length;
            allTasks = t;
            if (allTasks.length !== prev) { renderTodayTasks(); renderPins(); }
          }
        }).catch(function() {});
      } catch(_) {}
    });
    dbg('ACTION hook registered', 'ok');

    PluginAPI.registerHook(PluginAPI.Hooks.CURRENT_TASK_CHANGE, function(payload) {
      if (_syncingToSP) return;
      var current = payload && payload.current;
      if (current && (!timer.running || timer.taskId !== current.id)) {
        var jira = taskJiraId(current);
        startTimer(current.id, current.title, jira);
        dbg('HOOK: CURRENT_TASK_CHANGE → start "' + current.title + '"', 'ok');
      } else if (!current && timer.running) {
        stopTimer(true);
        dbg('HOOK: CURRENT_TASK_CHANGE → stop timer', 'ok');
      }
    });
    dbg('CURRENT_TASK_CHANGE hook registered', 'ok');
  } catch(e) {
    dbg('Hook registration ERROR: ' + e.message, 'error');
  }

  dbg('init() complete', 'ok');
}

// ── Wait for PluginAPI to be injected by SP, then init ──
// SP injects PluginAPI into the iframe window asynchronously after load.
// We poll window.PluginAPI (safe — never throws for missing window props).
var _initDone = false;
var _syncingToSP = false;
function safeInit() {
  if (_initDone) return;
  _initDone = true;
  dbg('safeInit() — PluginAPI now available', 'ok');
  init().catch(function(e) { dbg('init() CRASH: ' + e.message, 'error'); });
}

var _pollCount = 0;
var _poll = setInterval(function() {
  _pollCount++;
  if (typeof window.PluginAPI !== 'undefined') {
    clearInterval(_poll);
    dbg('PluginAPI injected after ~' + (_pollCount * 50) + 'ms', 'ok');
    // Register onReady AND call directly in case ready already fired
    try { window.PluginAPI.onReady(safeInit); } catch(_) {}
    setTimeout(safeInit, 200); // fallback if onReady never fires
  } else if (_pollCount >= 200) { // 10s hard timeout
    clearInterval(_poll);
    dbg('PluginAPI NEVER arrived (10s timeout) — cannot init', 'error');
  } else if (_pollCount === 1 || _pollCount % 20 === 0) {
    dbg('Waiting for PluginAPI... (' + (_pollCount * 50) + 'ms)', 'warn');
  }
}, 50);
