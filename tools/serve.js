// tiny static server used only for previewing the UI in a browser
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'src');
const board = path.join(__dirname, 'board');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/renderer/index.html';
  let f;
  if (p.startsWith('/board/')) f = path.join(board, p.slice(7));
  else if (p.startsWith('/build/')) f = path.join(__dirname, '..', p);
  else {
    f = path.join(root, p);
    if (!fs.existsSync(f)) f = path.join(root, 'renderer', p);
  }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(5173, () => console.log('preview on http://localhost:5173'));
