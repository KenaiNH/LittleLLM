import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const mode = process.argv[2];
if (mode !== 'unit' && mode !== 'electron') throw new Error('Choose unit or electron checks.');
const unit = mode === 'unit';
const directory = unit ? 'tests/unit' : 'tests/e2e';
const excluded = new Set(
  unit
    ? ['tts.test.ts', 'remainingTts.test.ts', 'speechService.test.ts', 'audioPlayer.test.ts']
    : ['voice.spec.ts', 'customVoice.spec.ts', 'native-click.spec.ts'],
);
const files = (await readdir(directory))
  .sort()
  .filter((name) => name.endsWith(unit ? '.test.ts' : '.spec.ts') && !excluded.has(name))
  .map((name) => `${directory}/${name}`);
if (!files.length) throw new Error('No checks found.');
console.log(`Running ${files.length} ${mode} files. Voice checks are skipped by user instruction.`);
if (!unit)
  console.log('Mouse-injected native-click check is separate; it requires an untouched pointer.');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  process.execPath,
  [
    unit ? 'node_modules/vitest/vitest.mjs' : 'node_modules/@playwright/test/cli.js',
    unit ? 'run' : 'test',
    ...files,
    ...process.argv.slice(3),
  ],
  { env, stdio: 'inherit', windowsHide: true },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
