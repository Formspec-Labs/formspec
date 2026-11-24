/** @filedesc Prepare the OS reader pinned by the packed Guidepup driver. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, release } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

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

if (reader.id === 'voiceover' && process.env.GITHUB_ACTIONS === 'true') {
  const library = join(homedir(), 'Library');
  const groupPreferences = join(library, 'Group Containers', 'group.com.apple.VoiceOver', 'Library', 'Preferences');
  const localPreferences = () => join(
    existsSync(groupPreferences) ? groupPreferences : join(library, 'Preferences'),
    'com.apple.VoiceOver4.local.plist',
  );
  if (!existsSync(localPreferences())) {
    // The first launch creates the local preferences that Guidepup reads before it mounts the DMG.
    execFileSync('/System/Library/CoreServices/VoiceOver.app/Contents/MacOS/VoiceOverStarter', [], {
      stdio: 'inherit',
      timeout: 5_000,
    });
    const deadline = performance.now() + 10_000;
    while (!existsSync(localPreferences())) {
      if (performance.now() >= deadline) {
        throw new Error(`VoiceOver did not create local preferences within 10 seconds: ${localPreferences()}`);
      }
      await delay(100);
    }
  }
  console.log('VoiceOver local preferences are ready');
}
