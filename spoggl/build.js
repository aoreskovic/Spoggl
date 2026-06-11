// Build script: concatenates src/ files into index.html
// Usage: node build.js
// Edit files in src/, then rebuild. Do NOT edit index.html directly.

const fs   = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Load order matters: utils before store (depends on todayStr),
// store before timer (depends on getEntries, scheduleSave),
// timer before entries (depends on stopTimer), etc.
const JS_FILES = [
  'utils.js',
  'store.js',
  'timer.js',
  'entries.js',
  'tasks.js',
  'pins.js',
  'schedule.js',
  'jira.js',
  'init.js',
];

function minifyCss(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
    .replace(/[ \t]+/g, ' ')                   // collapse horizontal whitespace
    .replace(/\s*([{}:;,>~])\s*/g, '$1')       // remove spaces around CSS operators
    .replace(/;}/g, '}')                       // trailing semicolon before }
    .replace(/\n/g, '')                        // remove newlines
    .trim();
}

function stripJsComments(src) {
  return src
    .replace(/^[ \t]*\/\/.*$/gm, '')           // full-line // comments
    .replace(/\n{2,}/g, '\n');                 // collapse blank lines
}

const css  = minifyCss(fs.readFileSync(path.join(srcDir, 'style.css'), 'utf8'));
const js   = stripJsComments(JS_FILES.map(f => fs.readFileSync(path.join(srcDir, f), 'utf8')).join('\n\n'));
const tmpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

const header = '<!-- GENERATED — do not edit directly. Edit src/ files, then run: node build.js -->\n';

const out = header + tmpl
  .replace('/* STYLE */', css)
  .replace('/* SCRIPT */', js);

fs.writeFileSync(path.join(__dirname, 'index.html'), out, 'utf8');
const sizeKB = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log('Built index.html (' + sizeKB + ' KB, ' + out.split('\n').length + ' lines)');
