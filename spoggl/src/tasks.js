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
  return (task.issueData && (task.issueData.key || task.issueData.issueKey)) ||
         task.issueKey || task.externalId || null;
}

function searchTasks(q) {
  if (!q || !q.trim()) return allTasks.slice(0, 15);
  var lq = q.toLowerCase();
  return allTasks.filter(function(t) {
    return t.title.toLowerCase().indexOf(lq) >= 0 || (taskJiraId(t) || '').toLowerCase().indexOf(lq) >= 0;
  }).slice(0, 15);
}

var _jiraSearchTimer = null;
function searchJira(q, callback) {
  clearTimeout(_jiraSearchTimer);
  if (!q || q.trim().length < 2) { callback([]); return; }
  var cfg = getJiraCfg();
  if (!cfg || !cfg.baseUrl) { callback([]); return; }
  _jiraSearchTimer = setTimeout(function() {
    var url = cfg.baseUrl + '/rest/api/3/issue/picker?query=' + encodeURIComponent(q.trim()) +
              '&showSubTasks=true&showSubTaskParent=true';
    fetch(url, { headers: { 'Authorization': 'Basic ' + btoa(cfg.email + ':' + cfg.apiToken) } })
      .then(function(r) { return r.ok ? r.json() : { sections: [] }; })
      .then(function(data) {
        var issues = [];
        (data.sections || []).forEach(function(s) {
          (s.issues || []).forEach(function(i) {
            issues.push({ key: i.key, summary: i.summaryText || i.key });
          });
        });
        var spKeys = new Set(allTasks.map(function(t) { return taskJiraId(t); }).filter(Boolean));
        callback(issues.filter(function(i) { return !spKeys.has(i.key); }).slice(0, 8));
      })
      .catch(function() { callback([]); });
  }, 300);
}

var selectedTask = null;

function showDropdown(spItems, jiraItems) {
  var dd = document.getElementById('task-dropdown');
  spItems  = spItems  || [];
  jiraItems = jiraItems || [];
  if (spItems.length === 0 && jiraItems.length === 0) { dd.classList.add('hidden'); return; }
  dd.innerHTML = '';
  spItems.forEach(function(task) {
    var jira = taskJiraId(task);
    var div  = document.createElement('div');
    div.className = 'task-dd-item';
    div.innerHTML = (jira ? '<span class="jira-chip">' + esc(jira) + '</span>' : '') +
                    '<span class="task-dd-title">' + esc(task.title) + '</span>';
    div.addEventListener('mousedown', function(e) { e.preventDefault(); pickTask(task); });
    dd.appendChild(div);
  });
  if (jiraItems.length > 0) {
    if (spItems.length > 0) {
      var sep = document.createElement('div');
      sep.className = 'task-dd-sep';
      sep.textContent = 'From Jira';
      dd.appendChild(sep);
    }
    jiraItems.forEach(function(issue) {
      var div = document.createElement('div');
      div.className = 'task-dd-item';
      div.innerHTML = '<span class="jira-chip">' + esc(issue.key) + '</span>' +
                      '<span class="task-dd-title">' + esc(issue.summary) + '</span>';
      div.addEventListener('mousedown', function(e) { e.preventDefault(); pickJiraIssue(issue.key, issue.summary); });
      dd.appendChild(div);
    });
  }
  dd.classList.remove('hidden');
}

function pickTask(task) {
  selectedTask = task;
  var jira = taskJiraId(task);
  document.getElementById('task-input').value = task.title + (jira ? ' (' + jira + ')' : '');
  document.getElementById('task-dropdown').classList.add('hidden');
}

function pickJiraIssue(key, summary) {
  selectedTask = null;
  document.getElementById('task-input').value = summary + ' (' + key + ')';
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

  // "Assigned to me" — Jira issues assigned to current user, not already in Today.
  // Do NOT filter by t.isDone: SP and Jira done-states are independent.
  // _myJiraKeys already contains only unresolved issues (filtered in JQL).
  var seenJiraKeys = new Set();
  allTasks.forEach(function(t) { var k = taskJiraId(t); if (k) seenJiraKeys.add(k); });

  var assignedList = allTasks.filter(function(t) {
    var jiraKey = taskJiraId(t) || t.issueId;
    return jiraKey && _myJiraKeys.has(jiraKey) && !seen[t.id];
  });

  // Jira issues that are not yet imported into SP at all — show directly from Jira API data
  var jiraOnlyItems = _myJiraIssues
    .filter(function(i) { return !seenJiraKeys.has(i.key); })
    .map(function(i) { return { id: 'jira-' + i.key, title: i.summary, issueKey: i.key }; });

  var combinedAssigned = assignedList.concat(jiraOnlyItems);
  dbg('renderTodayTasks: assignedList=' + assignedList.length + ' jiraOnly=' + jiraOnlyItems.length + ' _myJiraKeys=' + _myJiraKeys.size, 'state');
  combinedAssigned.forEach(function(t) { seen[t.id] = true; });

  // Exclude assigned tasks from Other so there's no duplication
  var inboxList = groups.inboxList.filter(function(t) { return !seen[t.id]; });

  var total = groups.todayList.length + combinedAssigned.length + inboxList.length;
  count.textContent = total > 0 ? total : allTasks.length;
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

  if (groups.todayList.length > 0) makeSection('Today', groups.todayList, 'today');

  // "Assigned to me" — always render if Jira configured, regardless of other sections
  var cfg = getJiraCfg();
  if (cfg && cfg.baseUrl) {
    makeSection('Assigned to me', combinedAssigned, 'assigned');
  } else {
    var hdrJ = document.createElement('div');
    hdrJ.className = 'tt-section';
    hdrJ.innerHTML = '<span class="tt-chevron">&#9654;</span>Assigned to me' +
      '<span class="tt-section-count" style="float:none;margin-left:4px;font-style:italic">— configure Jira</span>';
    list.appendChild(hdrJ);
  }

  // Other Tasks: inbox items, or all tasks if nothing else matched
  var otherList = inboxList.length > 0 ? inboxList.slice(0, 30)
                : total === 0          ? allTasks.slice(0, 30)
                : [];
  if (otherList.length > 0) makeSection('Other Tasks', otherList, 'other');

  if (list.children.length === 0) {
    list.innerHTML = '<div style="padding:12px;text-align:center;font-size:13px;color:#9e9e9e">No tasks found</div>';
  }
}
