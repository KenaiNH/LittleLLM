import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const directory = await mkdtemp(join(tmpdir(), 'littlellm-performance-'));
const packaged = process.argv[2];
const env = {
  ...process.env,
  LITTLELLM_TEST_USER_DATA: directory,
  LITTLELLM_MEASURE_PERFORMANCE: '1',
  LITTLELLM_MEASURE_STARTED: String(Date.now()),
};
delete env.ELECTRON_RUN_AS_NODE;
try {
  const child = spawn(
    packaged ? resolve(packaged) : resolve('node_modules/electron/dist/electron.exe'),
    packaged ? [] : ['out/main/index.js'],
    { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let errors = '';
  child.stderr.on('data', (chunk) => {
    errors = (errors + chunk).slice(-8000);
  });
  const timer = setTimeout(() => child.kill(), 30000);
  const code = await new Promise((resolve, reject) => {
    child.on('exit', resolve);
    child.on('error', reject);
  });
  clearTimeout(timer);
  if (code !== 0) throw new Error('Performance run failed: ' + errors);
  console.log(await readFile(join(directory, 'performance.json'), 'utf8'));
} finally {
  await rm(directory, { recursive: true, force: true });
}
