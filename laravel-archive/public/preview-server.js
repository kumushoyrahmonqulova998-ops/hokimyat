const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const routes = new Map([
  ['/', ['preview.html', 'text/html; charset=utf-8']],
  ['/preview.html', ['preview.html', 'text/html; charset=utf-8']],
  ['/css/dashboard.css', ['css/dashboard.css', 'text/css; charset=utf-8']],
]);

http.createServer((request, response) => {
  const route = routes.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (!route) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'Content-Type': route[1] });
  fs.createReadStream(path.join(root, route[0])).pipe(response);
}).listen(8765, '127.0.0.1', () => {
  console.log('Static preview ready at http://127.0.0.1:8765');
});
