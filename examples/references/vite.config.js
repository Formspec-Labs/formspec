import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

const repoRoot = path.resolve(__dirname, '../..');

/** Base for built HTML asset URLs — CLI `--base` overrides this at dev/preview time. */
const basePath = process.env.FORMSPEC_BASE_PATH || '/';

/** Serves `/examples`, `/packages`, `/registries` from the monorepo root (dev + preview). */
function attachRepoRootStatic(server) {
  const MIME = { '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
  server.middlewares.use((req, res, next) => {
    let pathname = req.url?.split('?')[0] || '';
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      /* ignore */
    }
    const viteBase = (server.config.base || '/').replace(/\/$/, '');
    if (viteBase && pathname.startsWith(viteBase)) {
      pathname = pathname.slice(viteBase.length) || '/';
    }
    if (
      !pathname.startsWith('/packages/') &&
      !pathname.startsWith('/examples/') &&
      !pathname.startsWith('/registries/')
    ) {
      return next();
    }
    const fsPath = path.join(repoRoot, pathname);
    const mime = MIME[path.extname(fsPath).toLowerCase()];
    if (!mime) return next();
    fs.readFile(fsPath, (err, data) => {
      if (err) return next();
      res.setHeader('Content-Type', mime);
      res.end(data);
    });
  });
}

export default defineConfig({
  base: basePath,
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        tools: path.resolve(__dirname, 'tools.html'),
      },
    },
  },
  server: {
    allowedHosts: true,
    fs: {
      allow: [repoRoot],
    },
  },
  plugins: [
    {
      name: 'repo-root-static',
      configureServer(server) {
        attachRepoRootStatic(server);
      },
      configurePreviewServer(server) {
        attachRepoRootStatic(server);
      },
    },
  ],
});
