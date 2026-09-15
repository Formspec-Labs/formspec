import { defineConfig } from 'vite';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const basePath = process.env.FORMSPEC_BASE_PATH || '/';

// No package aliases: the demo consumes `@formspec-org/*` through the workspace symlinks, i.e. each
// package's built `dist` exports. Aliasing to `src` would point `new URL('../uswds-integration.css',
// import.meta.url)` at a file that only the build produces. Run `npm run build` at the repo root first.
export default defineConfig({
  base: basePath,
  build: { target: 'es2022' },
  server: {
    allowedHosts: true,
    fs: { allow: [repoRoot] },
  },
});
