// ─────────────────────────────────────────
// JIRA SYNC
// ─────────────────────────────────────────

async function finishDay() {
  var cfg     = getJiraCfg();
  var entries = getEntries(selectedDate);
  var pending = entries.filter(function(e) { return e.status === 'pending' && e.jiraId; });
  var noId    = entries.filter(function(e) { return e.status === 'pending' && !e.jiraId; });

  if (pending.length === 0 && noId.length === 0) {
    PluginAPI.showSnack({ msg: 'No pending entries to sync', type: 'INFO' }); return;
  }
  // Mark non-Jira entries as done right away — they can't be synced but the day should still finish
  if (noId.length > 0) {
    noId.forEach(function(e) { e.status = 'synced'; });
    saveEntries(selectedDate, entries);
    renderTimeline();
    PluginAPI.showSnack({ msg: noId.length + ' entr' + (noId.length === 1 ? 'y' : 'ies') + ' without Jira ID marked done', type: 'INFO' });
  }
  if (!cfg || !cfg.baseUrl || !cfg.email || !cfg.apiToken) {
    if (pending.length > 0) PluginAPI.showSnack({ msg: 'Configure Jira integration first (⚙)', type: 'WARNING' });
    return;
  }
  if (pending.length === 0) return;

  var btn = document.getElementById('finish-day-btn');
  btn.disabled = true; btn.textContent = 'Syncing…';

  var authHeader = 'Basic ' + btoa(cfg.email + ':' + cfg.apiToken);
  var errCount   = 0;

  for (var i = 0; i < pending.length; i++) {
    var entry = pending[i];
    try {
      var res = await fetch(cfg.baseUrl + '/rest/api/2/issue/' + entry.jiraId + '/worklog', {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          started: jiraTs(entry.startTs),
          timeSpentSeconds: Math.max(60, Math.floor((entry.endTs - entry.startTs) / 1000)),
          comment: entry.title,
        }),
      });
      if (res.ok) { entry.status = 'synced'; entry.errorMsg = null; }
      else {
        var body = await res.text().catch(function() { return res.status; });
        entry.status = 'error'; entry.errorMsg = 'HTTP ' + res.status + ': ' + String(body).slice(0, 120); errCount++;
      }
    } catch (err) { entry.status = 'error'; entry.errorMsg = err.message; errCount++; }
  }

  saveEntries(selectedDate, entries);
  renderTimeline();
  btn.disabled = false;
  btn.textContent = selectedDate === todayStr() ? 'Finish Day' : 'Re-sync Day';

  if (errCount > 0) {
    var failList = entries.filter(function(e) { return e.status === 'error'; })
      .map(function(e) { return '<li style="margin-bottom:4px"><strong>' + esc(e.jiraId) + '</strong> – ' + esc(e.title) + '<br><small style="color:#f44336">' + esc(e.errorMsg) + '</small></li>'; }).join('');
    var answer = await PluginAPI.openDialog({
      title: errCount + ' entr' + (errCount === 1 ? 'y' : 'ies') + ' failed to sync',
      htmlContent: '<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.6">' + failList + '</ul>',
      buttons: [{ label: 'Retry failed', color: 'primary', raised: true }, { label: 'Close' }],
    });
    if (answer === 'Retry failed') {
      entries.filter(function(e) { return e.status === 'error'; }).forEach(function(e) { e.status = 'pending'; e.errorMsg = null; });
      saveEntries(selectedDate, entries); renderTimeline(); await finishDay();
    }
  } else {
    PluginAPI.showSnack({ msg: pending.length + ' entr' + (pending.length === 1 ? 'y' : 'ies') + ' synced!', type: 'SUCCESS' });
  }
}
