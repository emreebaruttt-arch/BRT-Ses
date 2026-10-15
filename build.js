const packager = require('@electron/packager');
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const electronVersion = require('electron/package.json').version;
const electronZip = `electron-v${electronVersion}-win32-x64.zip`;
const electronCache = path.resolve('electron-cache');
const electronZipDir = fs.existsSync(electronCache) ? fs.readdirSync(electronCache).map(n => path.join(electronCache, n)).find(d => fs.existsSync(path.join(d, electronZip))) : undefined;
packager({
  dir: '.', out: 'dist-release', name: 'SesOdasi', platform: 'win32', arch: 'x64', overwrite: true, prune: true,
  icon: 'assets/icon.ico', appCopyright: 'Ses Odasi', ...(electronZipDir ? { electronZipDir } : {}),
  ignore: [/^\/dist/, /^\/dist-release/, /^\/electron-cache/, /^\/install-tmp/, /^\/KUR\.bat/, /^\/build\.js/, /^\/prep\.js/, /^\/SesOdasi\.html/, /^\/OKU\.txt/]
}).then(p => {
  const folder = path.resolve(p[0]), zip = path.resolve('dist-release', 'SesOdasi-win32-x64.zip');
  const quote = s => "'" + s.replace(/'/g, "''") + "'";
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `Compress-Archive -LiteralPath ${quote(folder)} -DestinationPath ${quote(zip)} -CompressionLevel Fastest -Force`], { stdio: 'inherit', windowsHide: true });
  console.log('Olusturuldu: ' + folder);
  console.log('GitHub Releases dosyasi: ' + zip);
}).catch(e => { console.error(e); process.exit(1); });
