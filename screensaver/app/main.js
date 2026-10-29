// Mythic Screensaver – Electron side.
//   electron . --show     fullscreen saver on every monitor (started by watcher.py)
//   electron .            settings window
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const { execFile } = require('child_process');

// Privacy: throwaway profile (cache, storage, etc.) that is deleted on exit, no Chromium logging.
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
for (const d of fs.readdirSync(os.tmpdir())) {                   // sweep leftovers from runs that were killed
  const m = d.match(/^mythic-saver-(\d+)-/);
  if (m && !alive(+m[1])) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true });
}
// The launcher (watcher.py / mythic-saver) normally creates the profile and deletes it after we fully exit,
// because Chromium still writes files after our own exit hooks run.
const tmpProfile = process.env.MYTHIC_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), `mythic-saver-${process.pid}-`));
const wipeProfile = () => fs.rmSync(tmpProfile, { recursive: true, force: true });
process.on('SIGTERM', () => app.quit());                         // watcher stops us this way on input
app.setPath('userData', tmpProfile);
app.setPath('sessionData', tmpProfile);
app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('disable-breakpad');
app.on('quit', wipeProfile);                                    // best effort; the launcher finishes the job

const CONFIG = path.join(os.homedir(), '.config', 'mythic-saver', 'config.json');
const DEFAULTS = { enabled: true, idleSeconds: 20, animation: 'mythic', bounceText: 'AFK', fps: 60,
                   pauseForGames: true, extraGames: '' };
function loadConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8')) }; } catch { return { ...DEFAULTS }; }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  const tmp = CONFIG + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG);                                     // atomic, so the watcher never reads half a file
}

let saverWins = [];
function showSaver(cfg, quitWhenDone) {
  if (saverWins.length) return;
  for (const d of screen.getAllDisplays()) {
    const w = new BrowserWindow({
      ...d.bounds, frame: false, fullscreen: true, alwaysOnTop: true, skipTaskbar: true,
      backgroundColor: '#000000', show: false, autoHideMenuBar: true,
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.loadFile(path.join(__dirname, 'saver.html'), { query: { anim: cfg.animation, text: cfg.bounceText, fps: String(cfg.fps) } });
    w.once('ready-to-show', () => { w.show(); w.focus(); });
    w.on('closed', () => {                                         // one closes → they all close
      saverWins = saverWins.filter(x => x !== w);
      for (const o of saverWins) if (!o.isDestroyed()) o.close();
      if (quitWhenDone && !saverWins.length) app.quit();
    });
    saverWins.push(w);
  }
}

function showSettings() {
  const w = new BrowserWindow({
    width: 480, height: 800, resizable: false, backgroundColor: '#12121a', autoHideMenuBar: true,
    title: 'Mythic Screensaver',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  w.loadFile(path.join(__dirname, 'settings.html'));
  w.on('closed', () => { if (!saverWins.length) app.quit(); });
}

ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:set', (_e, cfg) => { saveConfig({ ...loadConfig(), ...cfg }); return loadConfig(); });
ipcMain.handle('saver:preview', (_e, cfg) => showSaver({ ...loadConfig(), ...cfg }, false));
ipcMain.handle('service:status', () => new Promise(res =>
  execFile('systemctl', ['--user', 'is-active', 'mythic-saver.service'], (_err, out) => res(String(out).trim()))));

app.whenReady().then(() => {
  if (process.argv.includes('--show')) showSaver(loadConfig(), true);
  else showSettings();
});
app.on('window-all-closed', () => app.quit());
