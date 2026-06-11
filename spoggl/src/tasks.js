// ─────────────────────────────────────────
// DAY PICKER
// ─────────────────────────────────────────

function selectDate(dateStr) {
  selectedDate = dateStr;
  var today   = todayStr();
  var isToday = dateStr === today;

  var label = formatDateLabel(dateStr);
  document.getElementById('current-date-label').textContent = label;
  var schedLbl = document.getElementById('sched-date-label');
  if (schedLbl) schedLbl.textContent = label;

  document.getElementById('next-day').disabled = (dateStr >= today);

  var finBtn = document.getElementById('finish-day-btn');
  finBtn.textContent = isToday ? 'Finish Day' : 'Re-sync Day';

  document.getElementById('task-input').disabled  = !isToday;
  document.getElementById('start-time-input').disabled = !isToday;
  document.getElementById('start-stop-btn').disabled   = !isToday;

  renderTimeline();
  updateTotal();
}

// ─────────────────────────────────────────
// TASK SEARCH / TASK HELPERS
// ─────────────────────────────────────────

function taskJiraId(task) {
  return (task.issueData && task.issueData.key) || task.issueKey || task.externalId || null;
}

function searchTasks(q) {
  if (!q || !q.trim()) return allTasks.slice(0, 15);
  var lq = q.toLowerCase();
  return allTasks.filter(function(t) {
    return t.title.toLowerCase().indexOf(lq) >= 0 || (taskJiraId(t) || '').toLowerCase().indexOf(lq) >= 0;
  }).slice(0, 15);
}

var selectedTask = null;

function showDropdown(items) {
  var dd = document.getElementById('task-dropdown');
  if (!items || items.length === 0) { dd.classList.add('hidden'); return; }
  dd.innerHTML = '';
  items.forEach(function(task) {
    var jira = taskJiraId(task);
    var div  = document.createElement('div');
    div.className = 'task-dd-item';
    div.innerHTML = (jira ? '<span class="jira-chip">' + esc(jira) + '</span>' : '') +
                    '<span class="task-dd-title">' + esc(task.title) + '</span>';
    div.addEventListener('click', function() { pickTask(task); });
    dd.appendChild(div);
  });
  dd.classList.remove('hidden');
}

function pickTask(task) {
  selectedTask = task;
  var jira = taskJiraId(task);
  document.getElementById('task-input').value = task.title + (jira ? ' (' + jira + ')' : '');
  document.getElementById('task-dropdown').classList.add('hidden');
}

// ─────────────────────────────────────────
// TODAY & INBOX TASK LIST
// ─────────────────────────────────────────

function getTodayAndInboxTasks() {
  var today    = todayStr();
  var todayTs  = new Date(today + 'T00:00:00').getTime();
  var nextTs   = todayTs + 86400000;

  var todayList = [];
  var inboxList = [];
  var seen = {};

  allTasks.forEach(function(t) {
    // NOTE: SP's TODAY tag is VIRTUAL — it never appears in task.tagIds.
    // Today membership comes from dueDay or dueWithTime only.
    var isToday = t.dueDay === today ||
                  (t.dueWithTime && t.dueWithTime >= todayTs && t.dueWithTime < nextTs);
    // "Inbox" = everything not due on a FUTURE day (includes project tasks with no dueDay,
    // overdue tasks, and classic no-project inbox tasks). Previously filtered by !projectId
    // which hid all Jira/project tasks as soon as any Today task existed.
    var isInbox = !t.dueDay || t.dueDay <= today;

    if (isToday) {
      todayList.push(t);
      seen[t.id] = true;
    } else if (isInbox && !seen[t.id]) {
      inboxList.push(t);
      seen[t.id] = true;
    }
  });

  return { todayList: todayList, inboxList: inboxList };
}

function renderTodayTasks() {
  var list  = document.getElementById('today-task-list');
  var count = document.getElementById('today-tasks-count');
  var groups = getTodayAndInboxTasks();
  var seen   = {};
  groups.todayList.forEach(function(t) { seen[t.id] = true; });

  // "Assigned to me" — Jira issues assigned to current user, not in Today, not done
  var assignedList = allTasks.filter(function(t) {
    var jiraKey = taskJiraId(t) || t.issueId;
    return jiraKey && _myJiraKeys.has(jiraKey) && !seen[t.id] && !t.isDone;
  });
  assignedList.forEach(function(t) { seen[t.id] = true; });

  // Exclude assigned tasks from Other so there's no duplication
  var inboxList = groups.inboxList.filter(function(t) { return !seen[t.id]; });

  var total = groups.todayList.length + assignedList.length + inboxList.length;
  var showAll = (total === 0 && allTasks.length > 0);
  count.textContent = showAll ? allTasks.length : total;
  list.innerHTML = '';

  function makeItem(task) {
    var jira     = taskJiraId(task);
    var isActive = timer.running && timer.taskId === task.id;
    var item     = document.createElement('div');
    item.className = 'today-task-item' + (isActive ? ' is-active' : '');
    item.title     = task.title;
    item.innerHTML = '<span class="tt-play">▶</span>' +
                     (jira ? '<span class="jira-chip">' + esc(jira) + '</span>' : '') +
                     '<span class="task-dd-title">' + esc(task.title) + '</span>';
    item.addEventListener('click', function() {
      if (selectedDate !== todayStr()) {
        PluginAPI.showSnack({ msg: 'Timer only available for today', type: 'WARNING' }); return;
      }
      pickTask(task);
      startTimer(task.id, task.title, jira);
    });
    return item;
  }

  function makeSection(title, items, key) {
    var collapsed = _sectionCollapsed[key];
    var hdr = document.createElement('div');
    hdr.className = 'tt-section tt-section-toggle';
    hdr.innerHTML = '<span class="tt-chevron">' + (collapsed ? '&#9654;' : '&#9660;') + '</span>' +
                    esc(title) + '<span class="tt-section-count">' + items.length + '</span>';
    hdr.addEventListener('click', function() {
      _sectionCollapsed[key] = !_sectionCollapsed[key];
      renderTodayTasks();
    });
    list.appendChild(hdr);
    if (!collapsed) {
      items.forEach(function(t) { list.appendChild(makeItem(t)); });
    }
  }

  if (showAll) {
    makeSection('All Tasks', allTasks, 'other');
    return;
  }

  if (total === 0 && _myJiraKeys.size === 0) {
    list.innerHTML = '<div style="padding:12px;text-align:center;font-size:13px;color:#9e9e9e">No tasks in Today or Inbox</div>';
    return;
  }

  if (groups.todayList.length > 0) makeSection('Today', groups.todayList, 'today');

  // "Assigned to me" section — always shown when Jira configured, even if empty
  var cfg = getJiraCfg();
  if (cfg && cfg.baseUrl) {
    if (assignedList.length > 0) {
      makeSection('Assigned to me', assignedList, 'assigned');
    } else {
      var hdrA = document.createElement('div');
      hdrA.className = 'tt-section tt-section-toggle';
      hdrA.innerHTML = '<span class="tt-chevron">&#9660;</span>Assigned to me<span class="tt-section-count">0</span>';
      list.appendChild(hdrA);
    }
  } else {
    var hdrJ = document.createElement('div');
    hdrJ.className = 'tt-section';
    hdrJ.innerHTML = '<span class="tt-chevron">&#9654;</span>Assigned to me' +
      '<span class="tt-section-count" style="float:none;margin-left:4px;font-style:italic">— configure Jira</span>';
    list.appendChild(hdrJ);
  }

  if (inboxList.length > 0) makeSection('Other Tasks', inboxList.slice(0, 30), 'other');
}
