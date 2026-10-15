// PeerJS kütüphanesini uygulamanın içine gömer (internet olmadan da yüklenir)
const fs = require('fs');
fs.mkdirSync('www', { recursive: true });
let h = fs.readFileSync('SesOdasi.html', 'utf8');
try {
  const lib = fs.readFileSync('node_modules/peerjs/dist/peerjs.min.js', 'utf8');
  h = h.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/peerjs@[^"]+"><\/script>/, () => '<script>' + lib.replace(/<\/script/gi, '<\\/script') + '</script>');
  console.log('PeerJS yerel olarak gomuldu.');
} catch (e) { console.log('PeerJS gomulemedi, internetten yuklenecek.'); }
fs.writeFileSync('www/index.html', h);
