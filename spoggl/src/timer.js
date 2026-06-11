// ─────────────────────────────────────────
// TIMER
// ─────────────────────────────────────────

// Apply running-timer UI state from the current `timer` object.
// Called by startTimer(), crash recovery, and cross-window sync.
function applyTimerUI() {
  document.getElementById('task-input').value = (timer.taskTitle || '') + (timer.jiraId ? ' (' + timer.jiraId + ')' : '');
  document.getElementById('start-time-input').value = timer.startTs ? tsToHHMM(timer.startTs) : '';
  var btn = document.getElementById('start-stop-btn');
  btn.textContent = '■ Stop';
  btn.classList.remove('btn-primary');
  btn.classList.add('btn-stop');
  document.getElementById('timer-display').classList.add('running');
  document.getElementById('status-bar').classList.remove('hidden');
}

function spStartTask(taskId) {
  if (!taskId || taskId.startsWith('custom-')) return;
  try {
    _syncingToSP = true;
    PluginAPI.dispatchAction({ type: '[Task] SetCurrentTask', id: taskId });
    dbg('dispatchAction SetCurrentTask id=' + taskId, 'ok');
  } catch(e) { dbg('dispatchAction failed: ' + e.message, 'warn'); }
  setTimeout(function() { _syncingToSP = false; }, 300);
}
function spStopTask() {
  try {
    _syncingToSP = true;
    PluginAPI.dispatchAction({ type: '[Task] SetCurrentTask', id: null });
  } catch(e) {}
  setTimeout(function() { _syncingToSP = false; }, 300);
}

function startTimer(taskId, taskTitle, jiraId) {
  dbg('startTimer: "' + taskTitle + '" jira=' + (jiraId || 'none'), 'ok');
  if (timer.running) stopTimer(false);

  var startTs = pendingStartTs || Date.now();
  pendingStartTs = null;

  Object.assign(timer, { running: true, taskId: taskId, taskTitle: taskTitle, jiraId: jiraId, startTs: startTs, entryId: uuid() });
  store['timer-state'] = Object.assign({}, timer);
  scheduleSave();

  applyTimerUI();
  spStartTask(taskId);

  clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);
  tickTimer();

  renderTodayTasks();
  renderPins();
  safeRenderSchedule();
}

function stopTimer(saveEntry) {
  if (saveEntry === undefined) saveEntry = true;
  if (!timer.running) return;
  dbg('stopTimer(save=' + saveEntry + ')');

  clearInterval(timerInterval);
  timerInterval = null;
  schedTickCount = 0;

  const endTs = Date.now();
  if (saveEntry && (endTs - timer.startTs) >= 10000) {
    const newEntry = {
      id: timer.entryId, taskId: timer.taskId, jiraId: timer.jiraId,
      title: timer.taskTitle, startTs: timer.startTs, endTs: endTs,
      status: 'pending', errorMsg: null,
    };
    const entries = getEntries(selectedDate);
    handleMergeAndAdd(newEntry, entries);
  }

  Object.assign(timer, { running: false, taskId: null, taskTitle: null, jiraId: null, startTs: null, entryId: null });
  delete store['timer-state'];
  scheduleSave(true);
  spStopTask();

  document.getElementById('timer-display').textContent = '00:00:00';
  document.getElementById('timer-display').classList.remove('running');
  document.getElementById('start-time-input').value = '';
  const btn = document.getElementById('start-stop-btn');
  btn.textContent = '▶ Start';
  btn.classList.remove('btn-stop');
  btn.classList.add('btn-primary');
  document.getElementById('status-bar').classList.add('hidden');

  renderTodayTasks();
  renderPins();
  updateTotal();
  renderTimeline();
}

function tickTimer() {
  if (!timer.running) return;
  document.getElementById('timer-display').textContent = msToHHMMSS(Date.now() - timer.startTs);
  updateTotal();
  schedTickCount++;
  if (schedTickCount % 40 === 0) updateSchedNow();
}
