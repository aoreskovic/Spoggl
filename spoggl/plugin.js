// Toggl Tracker plugin — host-side registrations only.
// All UI logic lives in index.html.

PluginAPI.registerHeaderButton({
  id: 'toggl-tracker-open',
  label: 'Tracker',
  icon: 'timer',
  onClick: () => {
    PluginAPI.showIndexHtmlAsView();
  },
});

PluginAPI.registerShortcut({
  id: 'toggl-tracker-shortcut',
  keys: 'ctrl+shift+t',
  label: 'Open Toggl Tracker',
  action: () => {
    PluginAPI.showIndexHtmlAsView();
  },
});
