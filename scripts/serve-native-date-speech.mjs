/** @filedesc Serve only the built native date fixture on the local browser-test port. */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve('browser');
const extensions = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const path = resolve(root, `.${decodeURIComponent(pathname)}`);
    const type = extensions[extname(path)];
    if (!path.startsWith(root + sep) || !type) throw new Error('Unknown fixture asset');
    const bytes = await readFile(path);
    res.writeHead(200, { 'Content-Type': type }).end(bytes);
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(process.argv[2]), '127.0.0.1');
