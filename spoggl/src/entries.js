// ─────────────────────────────────────────
// MERGE LOGIC
// ─────────────────────────────────────────

async function handleMergeAndAdd(newEntry, entries) {
  const sameTask = entries.filter(function(e) { return e.taskId === newEntry.taskId; });

  if (sameTask.length === 0) { addSorted(entries, newEntry); return; }

  const lastEntry = sameTask.reduce(function(a, b) { return b.endTs > a.endTs ? b : a; });
  const gap = newEntry.startTs - lastEntry.endTs;

  if (gap >= 0 && gap <= 30 * 60 * 1000) {
    lastEntry.endTs = newEntry.endTs;
    saveEntries(selectedDate, entries);
    renderTimeline();
    PluginAPI.showSnack({ msg: 'Auto-merged with previous entry for "' + newEntry.title + '"', type: 'INFO' });
    return;
  }

  const totalMs  = sameTask.reduce(function(s, e) { return s + (e.endTs - e.startTs); }, 0) + (newEntry.endTs - newEntry.startTs);
  const earliest = Math.min.apply(null, sameTask.map(function(e) { return e.startTs; }).concat([newEntry.startTs]));
  const latest   = Math.max.apply(null, sameTask.map(function(e) { return e.endTs; }).concat([newEntry.endTs]));

  var answer = await PluginAPI.openDialog({
    title: '"' + newEntry.title + '" — multiple entries today',
    htmlContent: '<p style="margin-bottom:10px">Task <strong>' + esc(newEntry.title) + '</strong> already has <strong>' + sameTask.length + '</strong> entr' + (sameTask.length === 1 ? 'y' : 'ies') + ' today.</p><p style="font-size:13px;color:#757575">Total: <strong>' + msToDur(totalMs) + '</strong> &nbsp;|&nbsp; Range: <strong>' + tsToHHMM(earliest) + ' – ' + tsToHHMM(latest) + '</strong></p>',
    buttons: [
      { label: 'Merge into one entry', color: 'primary', raised: true },
      { label: 'Keep separate' },
    ],
  });

  if (answer === 'Merge into one entry') {
    var other  = entries.filter(function(e) { return e.taskId !== newEntry.taskId; });
    var merged = Object.assign({}, lastEntry, { startTs: earliest, endTs: latest, status: sameTask.some(function(e) { return e.status === 'synced'; }) ? 'synced' : 'pending', errorMsg: null });
    other.push(merged);
    other.sort(function(a, b) { return b.startTs - a.startTs; });
    saveEntries(selectedDate, other);
  } else {
    addSorted(entries, newEntry);
  }
  renderTimeline();
}

function addSorted(entries, entry) {
  entries.push(entry);
  entries.sort(function(a, b) { return b.startTs - a.startTs; });
  saveEntries(selectedDate, entries);
}

// ─────────────────────────────────────────
// TOTAL TIME
// ─────────────────────────────────────────

function calcTotal(d) {
  var ms = getEntries(d).reduce(function(s, e) { return s + Math.max(0, e.endTs - e.startTs); }, 0);
  if (timer.running && d === selectedDate) ms += Date.now() - timer.startTs;
  return ms;
}

function updateTotal() {
  document.getElementById('total-display').textContent = 'Total: ' + msToDur(calcTotal(selectedDate));
}

// ─────────────────────────────────────────
// TIMELINE (entry list)
// ─────────────────────────────────────────

function renderTimeline() {
  var el = document.getElementById('timeline');
  var entries = getEntries(selectedDate);
  if (entries.length === 0) {
    el.innerHTML = '<div class="timeline-empty">No entries for this day</div>';
  } else {
    el.innerHTML = '';
    entries.forEach(function(entry) { el.appendChild(buildEntryCard(entry)); });
  }
  safeRenderSchedule();
}

function buildEntryCard(entry) {
  var dur = Math.max(0, entry.endTs - entry.startTs);
  var stClass = entry.status === 'synced' ? 'st-synced' : entry.status === 'error' ? 'st-error' : 'st-pending';
  var stLabel = entry.status === 'synced' ? '✓ synced' : entry.status === 'error' ? '✗ error' : '● pending';

  var div = document.createElement('div');
  div.className = 'entry-card';
  div.dataset.id = entry.id;
  div.innerHTML =
    '<div class="entry-name">' +
      (entry.jiraId ? '<span class="entry-jira">' + esc(entry.jiraId) + '</span>' : '') +
      '<span class="entry-title" title="' + esc(entry.title) + '">' + esc(entry.title) + '</span>' +
    '</div>' +
    '<div class="time-range">' +
      '<input class="ie time-ie" data-f="start" data-id="' + entry.id + '" value="' + tsToHHMM(entry.startTs) + '" title="Start time">' +
      '<span class="sep">–</span>' +
      '<input class="ie time-ie" data-f="end" data-id="' + entry.id + '" value="' + tsToHHMM(entry.endTs) + '" title="End time">' +
    '</div>' +
    '<input class="ie dur-ie" data-f="dur" data-id="' + entry.id + '" value="' + msToDur(dur) + '" title="Duration (e.g. 1h 30m)">' +
    '<span class="status-badge ' + stClass + '" title="' + esc(entry.errorMsg || '') + '">' + stLabel + '</span>' +
    '<div class="entry-actions">' +
      '<button class="icon-btn" data-a="restart" data-id="' + entry.id + '" title="Restart timer">▶</button>' +
      '<button class="icon-btn del" data-a="delete" data-id="' + entry.id + '" title="Delete">🗑</button>' +
    '</div>' +
    (entry.errorMsg ? '<div class="entry-err-row">⚠ ' + esc(entry.errorMsg) + '</div>' : '');

  div.querySelectorAll('.ie').forEach(function(inp) {
    inp.addEventListener('focus', function() { inp.select(); });
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { inp.blur(); }
      if (e.key === 'Escape') {
        var fresh = getEntries(selectedDate).find(function(x) { return x.id === inp.dataset.id; });
        if (!fresh) return;
        if (inp.dataset.f === 'start') inp.value = tsToHHMM(fresh.startTs);
        else if (inp.dataset.f === 'end') inp.value = tsToHHMM(fresh.endTs);
        else inp.value = msToDur(fresh.endTs - fresh.startTs);
        inp.blur();
      }
    });
    inp.addEventListener('blur', handleInlineEdit);
  });
  div.querySelectorAll('[data-a]').forEach(function(btn) { btn.addEventListener('click', handleEntryAction); });
  return div;
}

// ─────────────────────────────────────────
// INLINE EDIT
// ─────────────────────────────────────────

function handleInlineEdit(e) {
  var inp = e.target, field = inp.dataset.f, id = inp.dataset.id;
  var entries = getEntries(selectedDate);
  var idx = entries.findIndex(function(x) { return x.id === id; });
  if (idx < 0) return;
  var entry = entries[idx];

  if (field === 'start') {
    var ts = hhmmToTs(inp.value, selectedDate);
    if (!ts || ts >= entry.endTs) { inlineErr(inp, entry.startTs, 'start'); return; }
    if (hasOverlap(entries, id, ts, entry.endTs)) { inlineErr(inp, entry.startTs, 'start', 'Overlaps with another entry'); return; }
    entry.startTs = ts;
    syncDurInput(inp, entry);
  } else if (field === 'end') {
    var ts2 = hhmmToTs(inp.value, selectedDate);
    if (!ts2 || ts2 <= entry.startTs) { inlineErr(inp, entry.endTs, 'end'); return; }
    if (hasOverlap(entries, id, entry.startTs, ts2)) { inlineErr(inp, entry.endTs, 'end', 'Overlaps with another entry'); return; }
    entry.endTs = ts2;
    syncDurInput(inp, entry);
  } else if (field === 'dur') {
    var ms = parseDur(inp.value);
    if (!ms) { inp.value = msToDur(entry.endTs - entry.startTs); return; }
    var newEnd = entry.startTs + ms;
    if (hasOverlap(entries, id, entry.startTs, newEnd)) {
      inlineErr(inp, entry.endTs, 'end', 'Overlaps with another entry');
      inp.value = msToDur(entry.endTs - entry.startTs); return;
    }
    entry.endTs = newEnd;
    var card = inp.closest('.entry-card');
    var endInp = card.querySelector('[data-f="end"]');
    if (endInp) endInp.value = tsToHHMM(entry.endTs);
  }

  if (entry.status === 'error') { entry.status = 'pending'; entry.errorMsg = null; }
  saveEntries(selectedDate, entries);
  safeRenderSchedule();
  updateTotal();
}

function syncDurInput(inp, entry) {
  var card = inp.closest('.entry-card');
  var di = card.querySelector('[data-f="dur"]');
  if (di) di.value = msToDur(entry.endTs - entry.startTs);
}

function inlineErr(inp, resetTs, field, msg) {
  inp.classList.add('error');
  inp.value = field === 'dur' ? msToDur(0) : tsToHHMM(resetTs);
  setTimeout(function() { inp.classList.remove('error'); }, 1800);
  if (msg) PluginAPI.showSnack({ msg: msg, type: 'ERROR' });
}

function hasOverlap(entries, excludeId, start, end) {
  return entries.some(function(e) { return e.id !== excludeId && start < e.endTs && end > e.startTs; });
}

// ─────────────────────────────────────────
// ENTRY ACTIONS
// ─────────────────────────────────────────

function handleEntryAction(e) {
  var btn = e.currentTarget, action = btn.dataset.a, id = btn.dataset.id;
  var entries = getEntries(selectedDate);
  var entry = entries.find(function(x) { return x.id === id; });
  if (!entry) return;

  if (action === 'delete') {
    if (timer.running && timer.entryId === id) stopTimer(false);
    saveEntries(selectedDate, entries.filter(function(x) { return x.id !== id; }));
    renderTimeline(); updateTotal();
  } else if (action === 'restart') {
    if (selectedDate !== todayStr()) { PluginAPI.showSnack({ msg: 'Timer only available for today', type: 'WARNING' }); return; }
    startTimer(entry.taskId, entry.title, entry.jiraId);
  }
}
