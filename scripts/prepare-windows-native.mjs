import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { x } from 'tar';
// npm ci installs native optional packages for the host architecture only.
// Bundle both locked Windows variants before a dual-architecture release.
const root = resolve('.'),
  lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
await mkdir(join(root, '.tmp'), { recursive: true });
const temporary = await mkdtemp(join(root, '.tmp', 'windows-native-'));
if (
  !temporary.startsWith(join(root, '.tmp') + '\\') &&
  !temporary.startsWith(join(root, '.tmp') + '/')
)
  throw new Error('Temporary path leaves workspace');
try {
  for (const name of [
    '@img/sharp-win32-x64',
    '@img/sharp-win32-arm64',
    '@koromix/koffi-win32-x64',
    '@koromix/koffi-win32-arm64',
  ]) {
    const entry = lock.packages['node_modules/' + name];
    if (
      !entry?.resolved?.startsWith('https://registry.npmjs.org/') ||
      !entry.integrity?.startsWith('sha512-')
    )
      throw new Error('Missing locked native package: ' + name);
    const destination = join(root, 'node_modules', name);
    try {
      const installed = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'));
      if (installed.version === entry.version) continue;
    } catch {
      /* Download the locked variant. */
    }
    const response = await fetch(entry.resolved, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('Native package download failed: ' + name);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.length > 40 * 1024 * 1024 ||
      'sha512-' + createHash('sha512').update(bytes).digest('base64') !== entry.integrity
    )
      throw new Error('Native package integrity mismatch: ' + name);
    const file = join(temporary, name.replaceAll('/', '-') + '.tgz');
    await writeFile(file, bytes);
    await mkdir(destination, { recursive: true });
    await x({
      file,
      cwd: destination,
      strip: 1,
      strict: true,
      filter: (path, entry) =>
        path.startsWith('package/') &&
        !path.split('/').includes('..') &&
        ['File', 'Directory'].includes(entry.type),
    });
    const installed = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'));
    if (installed.name !== name || installed.version !== entry.version)
      throw new Error('Native package metadata mismatch');
    console.log('Prepared ' + name + ' ' + entry.version);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
