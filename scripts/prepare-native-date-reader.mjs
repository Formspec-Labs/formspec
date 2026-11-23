/** @filedesc Fetch the OS reader asset pinned by the packed Guidepup driver. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { release } from 'node:os';
import { join } from 'node:path';

const cache = process.env.GUIDEPUP_SCREEN_READERS_PATH;
if (!cache) throw new Error('Set GUIDEPUP_SCREEN_READERS_PATH to the runner’s reader cache');

const { screenReaders } = createRequire(import.meta.url)('@guidepup/guidepup/manifest.json');
const reader = screenReaders.find(({ defaultDownload, platforms }) => defaultDownload && platforms.includes(process.platform));
const platformVersion = release().split('.', 1)[0];
const asset = reader?.assets.find(entry => !entry.platformVersion || entry.platformVersion === platformVersion);
if (!asset) throw new Error(`Guidepup has no reader asset for ${process.platform} ${platformVersion}`);

const directory = join(cache, reader.id, asset.platformVersion ?? 'all', asset.version);
const path = join(directory, asset.asset);
const response = await fetch(`https://github.com/${asset.repository}/releases/download/${asset.version}/${asset.asset}`);
if (!response.ok) throw new Error(`Could not download ${asset.asset}: HTTP ${response.status}`);
const content = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(content).digest('hex') !== asset.sha256) {
  throw new Error(`Checksum mismatch for ${asset.asset}`);
}

await mkdir(directory, { recursive: true });
await writeFile(path, content);
if (reader.id === 'nvda') {
  const extracted = join(directory, 'extracted');
  await mkdir(extracted, { recursive: true });
  execFileSync('tar', ['-xf', path, '-C', extracted], { stdio: 'inherit' });
  await access(join(extracted, 'nvda.exe'));
}
console.log(`Prepared ${reader.name} ${asset.version} from ${asset.repository}`);
