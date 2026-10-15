const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, session, desktopCapturer, nativeImage, shell, dialog } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { pipeline } = require('stream/promises'), { Readable } = require('stream');

if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const logFile = () => path.join(app.getPath('userData'), 'log.txt');
function log(m) { try { fs.appendFileSync(logFile(), new Date().toISOString() + ' ' + m + '\n'); } catch (e) {} }
process.on('uncaughtException', (e) => { log('HATA: ' + (e && e.stack || e)); try { dialog.showErrorBox('Ses Odası hatası', String(e && e.message || e) + '\n\nKayıt dosyası: ' + logFile()); } catch (_) {} });
let win = null, tray = null, quitting = false, keys = {};
const UPDATE_REPO = 'emreebaruttt-arch/BRT-Ses', UPDATE_ASSET = 'SesOdasi-win32-x64.zip';
let latestRelease = null;
let cfg = { auto: false, tray: true, game: false };
const cfgFile = () => path.join(app.getPath('userData'), 'native.json');
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch (e) {}
const saveCfg = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg)); } catch (e) {} };
const iconPath = path.join(__dirname, 'assets', 'icon.png');
const send = (c) => { if (win && !win.isDestroyed()) win.webContents.send('cmd', c); };
const showWin = () => { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); };

/* ---- pencere ---- */
function createWindow() {
  win = new BrowserWindow({
    width: 1260, height: 800, minWidth: 860, minHeight: 560, show: false,
    backgroundColor: '#101015', title: 'Ses Odası', icon: iconPath, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  Menu.setApplicationMenu(null);
  const www = path.join(__dirname, 'www', 'index.html');
  win.loadFile(fs.existsSync(www) ? www : path.join(__dirname, 'SesOdasi.html'));
  const startHidden = process.argv.includes('--hidden');
  win.webContents.on('did-fail-load', (e, code, desc, url) => { log('Sayfa yuklenemedi: ' + code + ' ' + desc + ' ' + url); win.show(); dialog.showErrorBox('Ses Odası açılamadı', 'Sayfa yüklenemedi: ' + desc + '\n' + url + '\n\nKayıt dosyası: ' + logFile()); });
  win.webContents.on('render-process-gone', (e, d) => { log('Arayuz coktu: ' + d.reason); if (d.reason !== 'clean-exit') win.reload(); });
  win.webContents.on('console-message', (e, level, msg, line, src) => { if (level >= 2) log('Arayuz hatasi: ' + msg + ' (' + src + ':' + line + ')'); });
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible() && !startHidden) { log('ready-to-show gelmedi, pencere zorla gosteriliyor'); win.show(); } }, 4000);
  win.once('ready-to-show', () => {
    if (process.argv.includes('--hidden')) { if (!cfg.tray) { win.showInactive(); win.minimize(); } }
    else win.show();
  });
  win.on('close', (e) => { if (!quitting && cfg.tray) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

/* ---- tepsi, başlangıç, ayarlar ---- */
function applyCfg() {
  app.setLoginItemSettings({ openAtLogin: !!cfg.auto, args: cfg.auto ? ['--hidden'] : [] });
  if (cfg.tray && !tray) {
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
    tray.setToolTip('Ses Odası');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ses Odası\'nı aç', click: showWin },
      { label: 'Mikrofonu aç/kapat', click: () => send('mute') },
      { label: 'Kulaklığı aç/kapat', click: () => send('deaf') },
      { type: 'separator' },
      { label: 'Çıkış', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', showWin);
  } else if (!cfg.tray && tray) { tray.destroy(); tray = null; }
  gameWatch();
}
ipcMain.handle('cfg', () => cfg);
ipcMain.handle('setCfg', (e, c) => {
  for (const k of ['auto', 'tray', 'game']) if (c && k in c) cfg[k] = !!c[k];
  saveCfg(); applyCfg(); return cfg;
});

/* ---- GitHub Releases guncellemesi (portable Electron paketi) ---- */
function versionParts(v) { return String(v || '').replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(x => parseInt(x, 10) || 0); }
function isNewer(a, b) { const x = versionParts(a), y = versionParts(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
function fileSha256(file) { return new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); const s = fs.createReadStream(file); s.on('error', reject); s.on('data', d => h.update(d)); s.on('end', () => resolve(h.digest('hex'))); }); }
ipcMain.handle('update:check', async () => {
  try {
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'SesOdasi-Updater' }, signal: AbortSignal.timeout(15000) });
    if (r.status === 404) { latestRelease = null; return { ok: true, available: false, current: app.getVersion(), message: 'Henüz GitHub Releases bölümünde sürüm yayımlanmamış.' }; }
    if (!r.ok) throw new Error(`GitHub yanıtı: HTTP ${r.status}`);
    const release = await r.json(), version = String(release.tag_name || '').replace(/^v/i, '');
    const asset = (release.assets || []).find(x => x.name === UPDATE_ASSET);
    if (!asset) throw new Error(`Yayında ${UPDATE_ASSET} dosyası bulunamadı.`);
    if (!/^https:\/\/github\.com\//i.test(asset.browser_download_url || '')) throw new Error('Güncelleme adresi güvenli değil.');
    latestRelease = { version, name: release.name || `Sürüm ${version}`, notes: String(release.body || '').slice(0, 12000), url: asset.browser_download_url, digest: asset.digest || '' };
    const available = isNewer(version, app.getVersion());
    return { ok: true, available, current: app.getVersion(), version, name: latestRelease.name, notes: latestRelease.notes, message: available ? 'Yeni sürüm hazır.' : 'Uygulama güncel.' };
  } catch (e) { latestRelease = null; log('Guncelleme kontrolu hatasi: ' + (e && e.message || e)); return { ok: false, current: app.getVersion(), message: 'Güncellemeler kontrol edilemedi: ' + (e && e.message || 'bağlantı hatası') }; }
});
ipcMain.handle('update:version', () => app.getVersion());
ipcMain.handle('update:install', async () => {
  if (!app.isPackaged) return { ok: false, message: 'Güncelleme yalnızca paketlenmiş Windows uygulamasında kullanılabilir.' };
  if (!latestRelease || !latestRelease.version || !isNewer(latestRelease.version, app.getVersion())) return { ok: false, message: 'Önce güncellemeleri yeniden denetle.' };
  const digest = String(latestRelease.digest || '').match(/^sha256:([a-f0-9]{64})$/i);
  if (!digest) return { ok: false, message: 'GitHub bu dosya için SHA-256 doğrulama bilgisi vermedi; güvenlik için güncelleme durduruldu.' };
  const exe = app.getPath('exe'), target = path.dirname(exe), parent = path.dirname(target);
  let stage;
  try {
    await fs.promises.access(parent, fs.constants.W_OK);
    stage = await fs.promises.mkdtemp(path.join(parent, '.sesodasi-update-'));
    const zip = path.join(stage, UPDATE_ASSET), response = await fetch(latestRelease.url, { headers: { 'User-Agent': 'SesOdasi-Updater' }, signal: AbortSignal.timeout(180000) });
    if (!response.ok || !response.body) throw new Error(`Dosya indirilemedi (HTTP ${response.status}).`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(zip));
    const hash = await fileSha256(zip);
    if (hash.toLowerCase() !== digest[1].toLowerCase()) throw new Error('İndirilen dosyanın SHA-256 doğrulaması başarısız.');
    const extract = path.join(stage, 'extract'); await fs.promises.mkdir(extract);
    await new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${extract.replace(/'/g, "''")}' -Force`], { windowsHide: true, timeout: 180000 }, (e, out, err) => e ? reject(new Error((err || e.message).trim())) : resolve()));
    const candidate = path.join(extract, 'SesOdasi-win32-x64');
    await fs.promises.access(path.join(candidate, 'SesOdasi.exe'));
    const ps = (v) => `'${String(v).replace(/'/g, "''")}'`, old = target + '.rollback-' + Date.now();
    const script = path.join(stage, 'apply-update.ps1');
    const body = `$ErrorActionPreference='Stop'\n$target=${ps(target)}\n$source=${ps(candidate)}\n$old=${ps(old)}\n$pidToWait=${process.pid}\ntry { while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }; Move-Item -LiteralPath $target -Destination $old; Move-Item -LiteralPath $source -Destination $target; if (!(Test-Path (Join-Path $target 'SesOdasi.exe'))) { throw 'Yeni uygulama dosyaları eksik.' }; Start-Process (Join-Path $target 'SesOdasi.exe'); Start-Sleep -Seconds 8; $exePath=(Join-Path $target 'SesOdasi.exe'); $running=Get-Process -Name 'SesOdasi' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exePath }; if (!$running) { throw 'Güncellenen uygulama açılamadı.' }; Start-Sleep -Seconds 10; Remove-Item -LiteralPath $old -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath ${ps(stage)} -Recurse -Force -ErrorAction SilentlyContinue } catch { Add-Content -LiteralPath (Join-Path ${ps(parent)} 'SesOdasi-guncelleme-hatasi.txt') -Value (Get-Date -Format o); Add-Content -LiteralPath (Join-Path ${ps(parent)} 'SesOdasi-guncelleme-hatasi.txt') -Value $_.Exception.Message; if (Test-Path $old) { if (Test-Path $target) { Remove-Item -LiteralPath $target -Recurse -Force }; Move-Item -LiteralPath $old -Destination $target }; if (Test-Path (Join-Path $target 'SesOdasi.exe')) { Start-Process (Join-Path $target 'SesOdasi.exe') }; Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Güncelleme tamamlanamadı. Önceki sürüm geri yüklendi. Ayrıntı: ${String(path.join(parent, 'SesOdasi-guncelleme-hatasi.txt')).replace(/'/g, "''")}','Ses Odası güncellemesi') | Out-Null }`;
    await fs.promises.writeFile(script, body, 'utf8');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref(); quitting = true; app.quit(); return { ok: true, message: 'Güncelleme indirildi ve doğrulandı. Uygulama kapanıp yeniden açılacak.' };
  } catch (e) { log('Guncelleme yukleme hatasi: ' + (e && e.stack || e)); if (stage) fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {}); return { ok: false, message: 'Güncelleme yüklenemedi; mevcut sürüm korundu. ' + (e && e.message || '') }; }
});

/* ---- genel kısayollar ---- */
const NAMES = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Enter: 'Return', Escape: 'Esc' };
function toAcc(c) {
  if (!c) return null;
  const parts = c.split('+'), k = parts.pop();
  const key = NAMES[k] || k.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'num');
  return [...parts.map(x => x === 'Ctrl' ? 'CommandOrControl' : x), key].join('+');
}
function regKeys() {
  globalShortcut.unregisterAll();
  for (const [name, code] of Object.entries(keys)) {
    const acc = toAcc(code);
    if (acc) { try { globalShortcut.register(acc, () => send(name)); } catch (e) {} }
  }
}
ipcMain.on('keys', (e, k) => { keys = k || {}; regKeys(); });

/* ---- ekran paylaşımı: kaynak seçici + sistem sesi ---- */
function pick(list) {
  return new Promise((res) => {
    const w = new BrowserWindow({ parent: win, modal: true, width: 780, height: 540, title: 'Paylaşılacak ekranı seç', autoHideMenuBar: true, backgroundColor: '#101015', webPreferences: { nodeIntegration: true, contextIsolation: false } });
    let done = false;
    const fin = (v) => { if (done) return; done = true; ipcMain.removeListener('picked', h); res(v); if (!w.isDestroyed()) w.close(); };
    const h = (e, id) => fin(id);
    ipcMain.on('picked', h);
    w.on('closed', () => fin(null));
    w.loadFile(path.join(__dirname, 'picker.html'));
    w.webContents.once('did-finish-load', () => w.webContents.send('sources', list.map(s => ({ id: s.id, name: s.name, img: s.thumbnail.toDataURL() }))));
  });
}
function setupSession() {
  const ses = session.defaultSession, ok = ['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'fullscreen'];
  ses.setPermissionRequestHandler((wc, p, cb) => cb(ok.includes(p)));
  ses.setPermissionCheckHandler((wc, p) => ok.includes(p));
  ses.setDisplayMediaRequestHandler(async (req, cb) => {
    try {
      const own = win ? win.getMediaSourceId() : '';
      const list = (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })).filter(s => s.id !== own);
      const id = await pick(list), s = list.find(x => x.id === id);
      if (!s) { cb({}); return; }
      const o = { video: s };
      if (req.audioRequested) o.audio = 'loopback';
      cb(o);
    } catch (e) { try { cb({}); } catch (_) {} }
  });
}

/* ---- oyun algılama (isteğe bağlı, yalnızca bilinen oyun listesi) ---- */
const GAMES = { 'cs2.exe': 'Counter-Strike 2', 'valorant-win64-shipping.exe': 'Valorant', 'league of legends.exe': 'League of Legends', 'dota2.exe': 'Dota 2', 'fortniteclient-win64-shipping.exe': 'Fortnite', 'gta5.exe': 'GTA V', 'rocketleague.exe': 'Rocket League', 'r5apex.exe': 'Apex Legends', 'overwatch.exe': 'Overwatch 2', 'eldenring.exe': 'Elden Ring', 'tslgame.exe': 'PUBG', 'rainbowsix.exe': 'Rainbow Six Siege', 'robloxplayerbeta.exe': 'Roblox', 'destiny2.exe': 'Destiny 2', 'cyberpunk2077.exe': 'Cyberpunk 2077', 'rdr2.exe': 'Red Dead Redemption 2', 'wow.exe': 'World of Warcraft', 'witcher3.exe': 'The Witcher 3' };
let gTimer = null, lastG = null;
function gameWatch() {
  clearInterval(gTimer); gTimer = null;
  if (!cfg.game) { if (lastG) { lastG = null; if (win && !win.isDestroyed()) win.webContents.send('game', null); } return; }
  const run = () => execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
    if (err) return;
    const names = new Set(out.split('\n').map(l => (l.split('","')[0] || '').replace(/"/g, '').toLowerCase()));
    let g = null;
    for (const k of Object.keys(GAMES)) if (names.has(k)) { g = GAMES[k]; break; }
    if (g !== lastG) { lastG = g; if (win && !win.isDestroyed()) win.webContents.send('game', g); }
  });
  run(); gTimer = setInterval(run, 15000);
}

app.on('second-instance', showWin);
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
log('Baslatiliyor, surum ' + app.getVersion());
app.whenReady().then(() => { try { setupSession(); createWindow(); applyCfg(); log('Pencere olusturuldu'); } catch (e) { log('Baslatma hatasi: ' + (e && e.stack || e)); dialog.showErrorBox('Ses Odası başlatılamadı', String(e && e.message || e) + '\n\nKayıt dosyası: ' + logFile()); } });
