// ─────────────────────────────────────────
// PINNED TASKS
// ─────────────────────────────────────────

function renderPins() {
  var container = document.getElementById('pin-chips');
  var ps = getPinSettings();
  container.innerHTML = '';

  // Apply layout class to parent bar
  var bar = container.closest('.pins-bar');
  if (bar) bar.classList.toggle('stacked', ps.layout === 'stacked');

  getPinned().forEach(function(id) {
    var task = allTasks.find(function(t) { return t.id === id; });
    if (!task) return;
    var jira     = taskJiraId(task);
    var isActive = timer.running && timer.taskId === id;

    // Build label based on setting
    var shortTag = jira || task.title.slice(0, 5).toUpperCase();
    var labelText = ps.label === 'name'    ? task.title
                  : ps.label === 'tagname' ? (jira ? jira + ' ' : '') + task.title
                  : shortTag;

    function handleClick(e) {
      if (e.target.classList.contains('pin-remove') || e.target.dataset.id) {
        savePinned(getPinned().filter(function(x) { return x !== id; }));
        renderPins(); return;
      }
      if (selectedDate !== todayStr()) {
        try { PluginAPI.showSnack({ msg: 'Timer only available for today', type: 'WARNING' }); } catch(_) {}
        return;
      }
      startTimer(task.id, task.title, jira); renderPins();
    }

    if (ps.layout === 'stacked') {
      var row = document.createElement('div');
      row.className = 'pin-row' + (isActive ? ' active' : '');
      row.title = task.title;
      if (jira && ps.label !== 'name') {
        row.innerHTML = '<span class="pin-row-jira">' + esc(jira) + '</span>' +
                        (ps.label === 'tagname' ? '<span class="pin-row-label">' + esc(task.title) + '</span>' : '') +
                        '<button class="pin-remove" data-id="' + id + '">×</button>';
      } else {
        row.innerHTML = '<span class="pin-row-label">' + esc(labelText) + '</span>' +
                        '<button class="pin-remove" data-id="' + id + '">×</button>';
      }
      row.addEventListener('click', handleClick);
      container.appendChild(row);
    } else {
      var chip = document.createElement('div');
      chip.className = 'pin-chip' + (isActive ? ' active' : '');
      chip.title     = task.title;
      chip.innerHTML = '<span>' + esc(labelText) + '</span><button class="pin-remove" data-id="' + id + '">×</button>';
      chip.addEventListener('click', handleClick);
      container.appendChild(chip);
    }
  });
}

function renderPinSearch(q) {
  var container = document.getElementById('pin-results');
  var results   = searchTasks(q);
  var pinned    = getPinned();
  container.innerHTML = '';

  if (results.length === 0) {
    container.innerHTML = '<div style="padding:12px;text-align:center;font-size:13px;color:#9e9e9e">No results</div>';
    return;
  }
  results.forEach(function(task) {
    var jira     = taskJiraId(task);
    var isPinned = pinned.indexOf(task.id) >= 0;
    var div      = document.createElement('div');
    div.className = 'task-dd-item';
    div.style.justifyContent = 'space-between';
    div.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden">' +
        (jira ? '<span class="jira-chip">' + esc(jira) + '</span>' : '') +
        '<span class="task-dd-title">' + esc(task.title) + '</span>' +
      '</div>' +
      (isPinned
        ? '<span style="font-size:11px;color:#9e9e9e;flex-shrink:0">pinned</span>'
        : '<button class="btn-outline" style="font-size:11px;padding:2px 8px;flex-shrink:0" data-pid="' + task.id + '">Pin</button>');

    if (!isPinned) {
      div.querySelector('[data-pid]').addEventListener('click', function(e) {
        e.stopPropagation();
        var ids = getPinned();
        if (ids.length >= 6) { PluginAPI.showSnack({ msg: 'Maximum 6 pinned tasks', type: 'WARNING' }); return; }
        ids.push(task.id);
        savePinned(ids); renderPins();
        document.getElementById('pin-overlay').classList.add('hidden');
      });
    }
    container.appendChild(div);
  });
}
