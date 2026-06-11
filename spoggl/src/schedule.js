// ─────────────────────────────────────────
// SCHEDULE VIEW (right panel)
// ─────────────────────────────────────────

function safeRenderSchedule() {
  try { renderScheduleView(); } catch (err) {
    dbg('renderScheduleView ERROR: ' + err.message, 'error');
    console.error('Schedule render error:', err);
  }
}

function computeColumns(entries) {
  var sorted = entries.slice().sort(function(a,b){ return a.startTs - b.startTs; });
  var colAssign = {}; // id -> col number
  var active = []; // {endTs, col}

  sorted.forEach(function(e) {
    active = active.filter(function(a){ return a.endTs > e.startTs; });
    var used = active.map(function(a){ return a.col; });
    var col = 0; while (used.indexOf(col) >= 0) col++;
    colAssign[e.id] = col;
    active.push({ endTs: e.endTs, col: col });
  });

  var result = {};
  entries.forEach(function(e) {
    var overlapping = entries.filter(function(o){
      return o.id !== e.id && o.startTs < e.endTs && o.endTs > e.startTs;
    });
    var maxCol = colAssign[e.id] || 0;
    overlapping.forEach(function(o){ if ((colAssign[o.id]||0) > maxCol) maxCol = colAssign[o.id]||0; });
    result[e.id] = { col: colAssign[e.id] || 0, totalCols: maxCol + 1 };
  });
  return result;
}

function renderScheduleView() {
  var grid     = document.getElementById('schedule-grid');
  var entries  = getEntries(selectedDate);
  var dayStart = new Date(selectedDate + 'T00:00:00').getTime();

  // Visible hour range: minimum full work day 7–20, always include current time
  var rangeStartHour = 7, rangeEndHour = 20;

  if (selectedDate === todayStr()) {
    var nowHour = new Date().getHours();
    rangeEndHour   = Math.max(rangeEndHour, Math.min(24, nowHour + 2));
    rangeStartHour = Math.min(rangeStartHour, Math.max(0, nowHour - 1));
  }

  if (entries.length > 0 || timer.running) {
    var allTs = [];
    entries.forEach(function(e) { allTs.push(e.startTs, e.endTs); });
    if (timer.running && selectedDate === todayStr()) {
      allTs.push(timer.startTs, Date.now());
    }
    if (allTs.length > 0) {
      var earliest = Math.min.apply(null, allTs);
      var latest   = Math.max.apply(null, allTs);
      rangeStartHour = Math.min(rangeStartHour, Math.max(0,  Math.floor((earliest - dayStart) / 3600000) - 1));
      rangeEndHour   = Math.max(rangeEndHour,   Math.min(24, Math.ceil((latest   - dayStart) / 3600000) + 1));
    }
  }

  var rangeStartMs = dayStart + rangeStartHour * 3600000;
  var totalMinutes = (rangeEndHour - rangeStartHour) * 60;
  var pxpm         = currentPxPerMin();
  var totalHeight  = totalMinutes * pxpm;

  schedState.rangeStartMs = rangeStartMs;
  schedState.pxPerMin     = pxpm;

  grid.innerHTML = '';
  grid.style.height = totalHeight + 'px';

  // Hour and half-hour grid lines
  for (var h = rangeStartHour; h <= rangeEndHour; h++) {
    var y = (h - rangeStartHour) * 60 * pxpm;

    var line = document.createElement('div');
    line.className = 'sched-hour';
    line.style.top = y + 'px';

    var lbl = document.createElement('span');
    lbl.className   = 'sched-hour-label';
    lbl.textContent = pad(h % 24) + ':00';
    line.appendChild(lbl);
    grid.appendChild(line);

    if (h < rangeEndHour) {
      var half = document.createElement('div');
      half.className = 'sched-half';
      half.style.top = (y + 30 * pxpm) + 'px';
      grid.appendChild(half);
    }
  }

  // Include the live timer as a synthetic entry so computeColumns can detect overlaps with it
  var liveEntry = null;
  if (timer.running && selectedDate === todayStr()) {
    liveEntry = { id: '__live__', startTs: timer.startTs, endTs: Date.now() };
  }
  var colEntries = liveEntry ? entries.concat([liveEntry]) : entries;
  var cols = computeColumns(colEntries);

  entries.forEach(function(entry) {
    var ci = cols[entry.id] || { col: 0, totalCols: 1 };
    var block = buildScheduleBlock(entry, rangeStartMs, pxpm, ci.col, ci.totalCols);
    if (block) grid.appendChild(block);
  });

  // Live "in-progress" block — positioned using its column slot
  if (liveEntry) {
    var ci      = cols['__live__'] || { col: 0, totalCols: 1 };
    var startMin = (liveEntry.startTs - rangeStartMs) / 60000;
    var durMin   = Math.max(1, (Date.now() - liveEntry.startTs) / 60000);
    var live     = document.createElement('div');
    live.className = 'sched-entry-block live';
    live.style.top       = (startMin * pxpm) + 'px';
    live.style.minHeight = Math.max(20, durMin * pxpm) + 'px';
    if (ci.totalCols === 1) {
      live.style.left  = '40px';
      live.style.right = '4px';
    } else {
      live.style.left  = 'calc(40px + ' + (ci.col / ci.totalCols) + ' * (100% - 44px))';
      live.style.width = 'calc(' + (1 / ci.totalCols) + ' * (100% - 44px) - 1px)';
      live.style.right = 'auto';
    }
    var ll = document.createElement('div');
    ll.className   = 'sched-entry-label';
    ll.textContent = (timer.jiraId ? timer.jiraId + ' ' : '') + timer.taskTitle;
    live.appendChild(ll);
    grid.appendChild(live);
  }

  // Current-time "now" line
  if (selectedDate === todayStr()) {
    var nowMin   = (Date.now() - rangeStartMs) / 60000;
    if (nowMin >= 0 && nowMin <= totalMinutes) {
      var nowLine = document.createElement('div');
      nowLine.className = 'sched-now-line';
      nowLine.style.top = (nowMin * pxpm) + 'px';
      var nowDot = document.createElement('div');
      nowDot.className = 'sched-now-dot';
      nowLine.appendChild(nowDot);
      grid.appendChild(nowLine);
    }
  }
}

function buildScheduleBlock(entry, rangeStartMs, pxpm, col, totalCols) {
  col = col || 0; totalCols = totalCols || 1;
  var offsetMin = (entry.startTs - rangeStartMs) / 60000;
  var durMin    = Math.max(1, (entry.endTs - entry.startTs) / 60000);
  var top       = offsetMin * pxpm;
  var height    = Math.max(6, durMin * pxpm);

  var stClass = entry.status === 'synced' ? 'st-synced' : entry.status === 'error' ? 'st-error' : '';

  var block = document.createElement('div');
  block.className = 'sched-entry-block' + (stClass ? ' ' + stClass : '');
  block.dataset.id = entry.id;
  block.style.top       = top + 'px';
  block.style.minHeight = height + 'px';
  // Column layout: split horizontally when entries overlap
  if (totalCols === 1) {
    block.style.left  = '40px';
    block.style.right = '4px';
  } else {
    var gap = 1;
    block.style.left  = 'calc(40px + ' + (col / totalCols) + ' * (100% - 44px))';
    block.style.width = 'calc(' + (1 / totalCols) + ' * (100% - 44px) - ' + gap + 'px)';
    block.style.right = 'auto';
  }

  var lbl = document.createElement('div');
  lbl.className   = 'sched-entry-label';
  lbl.textContent = (entry.jiraId ? entry.jiraId + ' ' : '') + entry.title;
  block.appendChild(lbl);

  var topH = document.createElement('div');
  topH.className = 'sched-handle sched-handle-top';
  topH.addEventListener('mousedown', function(e) { onHandleMousedown(e, entry, 'top'); });
  block.appendChild(topH);

  var botH = document.createElement('div');
  botH.className = 'sched-handle sched-handle-bot';
  botH.addEventListener('mousedown', function(e) { onHandleMousedown(e, entry, 'bot'); });
  block.appendChild(botH);

  // Block body drag = move the entire entry
  block.addEventListener('mousedown', function(e) {
    if (e.target.classList.contains('sched-handle') || e.target.closest('.sched-handle')) return;
    onBlockMove(e, entry);
  });

  // Right-click context menu
  block.addEventListener('contextmenu', function(e) {
    e.preventDefault(); e.stopPropagation();
    showCtxMenu(e, entry);
  });

  return block;
}

function onHandleMousedown(e, entry, handle) {
  e.preventDefault(); e.stopPropagation();

  var origStart = entry.startTs;
  var origEnd   = entry.endTs;
  var startY    = e.clientY;
  var SNAP_MS   = 15 * 60 * 1000;

  var block = document.querySelector('.sched-entry-block[data-id="' + entry.id + '"]');
  if (block) block.classList.add('dragging');

  function onMove(me) {
    var deltaMin = Math.round((me.clientY - startY) / PX_PER_MIN / 15) * 15;
    var deltaMs  = deltaMin * 60000;

    if (handle === 'top') {
      var ns = origStart + deltaMs;
      // Snap start edge to the end of a nearby entry
      var SNAP_THRESH = 8 * 60000;
      getEntries(selectedDate).forEach(function(o) {
        if (o.id !== entry.id && Math.abs(o.endTs - ns) < SNAP_THRESH) ns = o.endTs;
      });
      if (ns < origEnd - SNAP_MS) entry.startTs = ns;
    } else {
      var ne = origEnd + deltaMs;
      // Snap end edge to the start of a nearby entry
      var SNAP_THRESH = 8 * 60000;
      getEntries(selectedDate).forEach(function(o) {
        if (o.id !== entry.id && Math.abs(o.startTs - ne) < SNAP_THRESH) ne = o.startTs;
      });
      if (ne > origStart + SNAP_MS) entry.endTs = ne;
    }

    // Live-update block position
    if (block) {
      var om = (entry.startTs - schedState.rangeStartMs) / 60000;
      var dm = Math.max(1, (entry.endTs - entry.startTs) / 60000);
      block.style.top    = (om * schedState.pxPerMin) + 'px';
      block.style.height = Math.max(6, dm * schedState.pxPerMin) + 'px';
    }

    // Mirror into list card fields
    var card = document.querySelector('.entry-card[data-id="' + entry.id + '"]');
    if (card) {
      var si = card.querySelector('[data-f="start"]');
      var ei = card.querySelector('[data-f="end"]');
      var di = card.querySelector('[data-f="dur"]');
      if (si) si.value = tsToHHMM(entry.startTs);
      if (ei) ei.value = tsToHHMM(entry.endTs);
      if (di) di.value = msToDur(entry.endTs - entry.startTs);
    }
    updateTotal();
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (block) block.classList.remove('dragging');

    var liveEntries = getEntries(selectedDate);
    if (entry.status === 'error') { entry.status = 'pending'; entry.errorMsg = null; }
    saveEntries(selectedDate, liveEntries);
    safeRenderSchedule(); renderTimeline(); updateTotal();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

var _ctxEntry = null;
function hideCtxMenu() {
  var m = document.getElementById('ctx-menu');
  if (m) { m.classList.add('hidden'); m.innerHTML = ''; }
  _ctxEntry = null;
}
function showCtxMenu(e, entry) {
  hideCtxMenu();
  _ctxEntry = entry;
  var m = document.getElementById('ctx-menu');
  if (!m) return;

  var items = [
    { icon: '▶', label: 'Restart timer',    action: 'restart' },
    { icon: '✂', label: 'Split at midpoint', action: 'split'   },
    { icon: '🗑', label: 'Delete',            action: 'delete', danger: true },
  ];

  items.forEach(function(it) {
    var div = document.createElement('div');
    div.className = 'ctx-item' + (it.danger ? ' danger' : '');
    div.innerHTML = '<span style="font-size:12px;width:16px;text-align:center">' + it.icon + '</span>' + esc(it.label);
    div.addEventListener('click', function() {
      hideCtxMenu();
      handleCtxAction(it.action, entry);
    });
    m.appendChild(div);
  });

  // Position at cursor, keep inside viewport
  var x = e.clientX, y = e.clientY;
  m.classList.remove('hidden');
  var rect = m.getBoundingClientRect();
  if (x + rect.width  > window.innerWidth)  x = window.innerWidth  - rect.width  - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  m.style.left = x + 'px'; m.style.top = y + 'px';
}
function handleCtxAction(action, entry) {
  if (action === 'delete') {
    var entries = getEntries(selectedDate).filter(function(e){ return e.id !== entry.id; });
    saveEntries(selectedDate, entries);
    renderTimeline(); safeRenderSchedule(); updateTotal();

  } else if (action === 'restart') {
    if (selectedDate !== todayStr()) {
      try { PluginAPI.showSnack({ msg: 'Timer only available for today', type: 'WARNING' }); } catch(_) {}
      return;
    }
    startTimer(entry.taskId || ('custom-' + Date.now()), entry.title, entry.jiraId || null);

  } else if (action === 'split') {
    var mid = Math.round((entry.startTs + entry.endTs) / 2 / (15*60000)) * (15*60000);
    if (mid <= entry.startTs || mid >= entry.endTs) return;
    var second = Object.assign({}, entry, { id: uuid(), startTs: mid });
    entry.endTs = mid;
    var all = getEntries(selectedDate);
    var idx = all.findIndex(function(x){ return x.id === entry.id; });
    if (idx >= 0) all.splice(idx + 1, 0, second);
    saveEntries(selectedDate, all);
    renderTimeline(); safeRenderSchedule(); updateTotal();
  }
}

function onBlockMove(e, entry) {
  e.preventDefault(); e.stopPropagation();

  var origStart = entry.startTs;
  var origEnd   = entry.endTs;
  var startY    = e.clientY;
  var dur       = origEnd - origStart;
  var SNAP_MIN  = 15;
  var dayStart  = new Date(selectedDate + 'T00:00:00').getTime();

  var block = document.querySelector('.sched-entry-block[data-id="' + entry.id + '"]');
  if (block) block.classList.add('dragging', 'moving');

  function onMove(me) {
    var deltaMin = Math.round((me.clientY - startY) / schedState.pxPerMin / SNAP_MIN) * SNAP_MIN;
    var deltaMs  = deltaMin * 60000;
    var newStart = origStart + deltaMs;
    var newEnd   = newStart + dur;

    // Clamp to day
    if (newStart < dayStart) { newStart = dayStart; newEnd = newStart + dur; }
    if (newEnd > dayStart + 86400000) { newEnd = dayStart + 86400000; newStart = newEnd - dur; }

    entry.startTs = newStart;
    entry.endTs   = newEnd;

    if (block) {
      var om = (entry.startTs - schedState.rangeStartMs) / 60000;
      var dm = Math.max(1, dur / 60000);
      block.style.top       = (om * schedState.pxPerMin) + 'px';
      block.style.minHeight = Math.max(6, dm * schedState.pxPerMin) + 'px';
    }

    var card = document.querySelector('.entry-card[data-id="' + entry.id + '"]');
    if (card) {
      var si = card.querySelector('[data-f="start"]'), ei = card.querySelector('[data-f="end"]');
      if (si) si.value = tsToHHMM(entry.startTs);
      if (ei) ei.value = tsToHHMM(entry.endTs);
    }
    updateTotal();
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (block) block.classList.remove('dragging', 'moving');

    var liveEntries = getEntries(selectedDate);
    saveEntries(selectedDate, liveEntries);
    safeRenderSchedule(); renderTimeline(); updateTotal();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function updateSchedNow() {
  if (selectedDate !== todayStr()) return;
  var grid = document.getElementById('schedule-grid');
  if (!grid || !grid.style.height) return;

  var totalMinutes = parseInt(grid.style.height) / schedState.pxPerMin;
  var nowMin = (Date.now() - schedState.rangeStartMs) / 60000;

  var line = grid.querySelector('.sched-now-line');
  if (line && nowMin >= 0 && nowMin <= totalMinutes) {
    line.style.top = (nowMin * schedState.pxPerMin) + 'px';
  }
  var live = grid.querySelector('.sched-entry-block.live');
  if (live && timer.running) {
    var sm = (timer.startTs - schedState.rangeStartMs) / 60000;
    var dm = Math.max(1, (Date.now() - timer.startTs) / 60000);
    live.style.top       = (sm * schedState.pxPerMin) + 'px';
    live.style.minHeight = Math.max(20, dm * schedState.pxPerMin) + 'px';
  }
}

function schedScrollToNow() {
  if (selectedDate !== todayStr()) return;
  var panel = document.getElementById('right-panel');
  if (!panel) return;
  var nowMin = (Date.now() - schedState.rangeStartMs) / 60000;
  panel.scrollTop = Math.max(0, nowMin * schedState.pxPerMin - panel.clientHeight / 3);
}

// ── Quick entry on empty grid click ──

var _quickEntry = null;

function hideQuickEntry() {
  if (_quickEntry && _quickEntry.parentNode) _quickEntry.parentNode.removeChild(_quickEntry);
  _quickEntry = null;
  document.removeEventListener('mousedown', _onQuickEntryOutside, true);
}

function _onQuickEntryOutside(e) {
  if (_quickEntry && !_quickEntry.contains(e.target)) hideQuickEntry();
}

function onScheduleGridClick(e) {
  if (e.target.closest('.sched-entry-block') || e.target.closest('.sched-handle')) return;

  var panel = document.getElementById('right-panel');
  var grid  = document.getElementById('schedule-grid');
  var gridRect = grid.getBoundingClientRect();

  var y = e.clientY - gridRect.top + panel.scrollTop;
  var clickTs = schedState.rangeStartMs + (y / schedState.pxPerMin) * 60000;

  var SNAP = 15 * 60000;
  var startTs = Math.round(clickTs / SNAP) * SNAP;
  var endTs   = startTs + 30 * 60000;

  showQuickEntry(e.clientX, e.clientY, startTs, endTs);
}

function showQuickEntry(cx, cy, startTs, endTs) {
  hideQuickEntry();

  var wrap = document.createElement('div');
  wrap.className = 'sched-quick-entry';

  var timeLabel = document.createElement('div');
  timeLabel.className = 'sched-quick-entry-time';
  timeLabel.textContent = tsToHHMM(startTs) + ' – ' + tsToHHMM(endTs);
  wrap.appendChild(timeLabel);

  var inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'Search or type task name…';
  inp.autocomplete = 'off';
  wrap.appendChild(inp);

  var results = document.createElement('div');
  results.className = 'sched-quick-entry-results';
  wrap.appendChild(results);

  var pickedTask = null;

  function renderResults(q) {
    results.innerHTML = '';
    searchTasks(q).forEach(function(task) {
      var jira = taskJiraId(task);
      var div = document.createElement('div');
      div.className = 'task-dd-item';
      div.innerHTML = (jira ? '<span class="jira-chip">' + esc(jira) + '</span>' : '') +
                      '<span class="task-dd-title">' + esc(task.title) + '</span>';
      div.addEventListener('mousedown', function(e) {
        e.preventDefault();
        commit(task.id, task.title, jira);
      });
      results.appendChild(div);
    });
  }

  function commit(taskId, taskTitle, jiraId) {
    hideQuickEntry();
    var entry = {
      id: uuid(), taskId: taskId, jiraId: jiraId || null,
      title: taskTitle, startTs: startTs, endTs: endTs,
      status: 'pending', errorMsg: null,
    };
    addSorted(getEntries(selectedDate), entry);
    renderTimeline();
    updateTotal();
  }

  inp.addEventListener('input', function() {
    pickedTask = null;
    renderResults(inp.value);
  });

  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { hideQuickEntry(); return; }
    if (e.key !== 'Enter') return;
    var q = inp.value.trim();
    if (!q) { hideQuickEntry(); return; }
    var items = searchTasks(q);
    if (items.length === 1) {
      commit(items[0].id, items[0].title, taskJiraId(items[0]));
    } else {
      var m = q.match(/\(([A-Z][A-Z0-9_]+-\d+)\)\s*$/);
      commit('custom-' + Date.now(), m ? q.replace(/\s*\([^)]+\)\s*$/, '').trim() : q, m ? m[1] : null);
    }
  });

  document.body.appendChild(wrap);
  _quickEntry = wrap;
  wrap.style.visibility = 'hidden';

  setTimeout(function() {
    var rect = wrap.getBoundingClientRect();
    var x = cx, y = cy + 8;
    if (x + rect.width  > window.innerWidth)  x = window.innerWidth  - rect.width  - 8;
    if (y + rect.height > window.innerHeight) y = cy - rect.height - 8;
    wrap.style.left = x + 'px';
    wrap.style.top  = y + 'px';
    wrap.style.visibility = '';
    inp.focus();
    renderResults('');
  }, 0);

  document.addEventListener('mousedown', _onQuickEntryOutside, true);
}
