import { _electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';

const [baseUrl, model, provider = 'openai-compatible'] = process.argv.slice(2);
if (!['openai-compatible', 'ollama'].includes(provider))
  throw new Error('Choose a local OpenAI-compatible or native Ollama provider.');
if (!baseUrl || !model) {
  console.error('Usage: npm.cmd run smoke:local -- http://localhost:1234/v1 <loaded-model-id>');
  process.exit(2);
}
const url = new URL(baseUrl);
if (
  !['http:', 'https:'].includes(url.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  url.username ||
  url.password
)
  throw new Error('This acceptance check requires a local model URL without credentials.');
const directory = await mkdtemp(join(tmpdir(), 'littlellm-local-')),
  env = { ...process.env, LITTLELLM_TEST_USER_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await _electron.launch({ args: ['out/main/index.js'], env });
  const pet = await app.firstWindow();
  await pet.getByTestId('sprite').waitFor();
  const result = await pet.evaluate(
    async ({ baseUrl, model, provider }) => {
      const config = await window.companion.getConfig();
      if (!config.ok) throw new Error(config.error.userMessage);
      await window.companion.setConfig('llm', {
        ...config.value.llm,
        provider,
        baseUrl,
        model,
        stream: true,
        timeoutMs: 120000,
        retryAttempts: 0,
      });
      await window.companion.setConfig('bubble', { ...config.value.bubble, textReveal: 'instant' });
      const connection = await window.companion.testModelConnection();
      if (!connection.ok) throw new Error(connection.error.userMessage);
      return new Promise((resolve, reject) => {
        let text = '',
          chunks = 0,
          id = '',
          finished = false;
        const started = performance.now();
        let firstTokenMs = 0;
        const stop = window.companion.onChatDelta((event) => {
          if (id && event.requestId !== id) return;
          if (event.delta.type === 'text') {
            if (!chunks) firstTokenMs = performance.now() - started;
            text += event.delta.text;
            chunks++;
          } else {
            finished = true;
            clearTimeout(timer);
            stop();
            if (event.delta.type === 'error') reject(new Error(event.delta.error.userMessage));
            else
              resolve({
                text,
                chunks,
                firstTokenMs,
                elapsedMs: performance.now() - started,
                connectionTest: {
                  passed: true,
                  latencyMs: connection.value.latencyMs,
                  modelsFound: connection.value.models.length,
                },
              });
          }
        });
        const timer = setTimeout(() => {
          stop();
          void window.companion.abortChat(id || undefined);
          reject(new Error('Local-model check timed out.'));
        }, 150000);
        void window.companion
          .chat('Write one friendly sentence of about twelve words welcoming me to my desktop.')
          .then(
            (reply) => {
              if (reply.ok) id = reply.value;
              else {
                if (!finished) {
                  clearTimeout(timer);
                  stop();
                  reject(new Error(reply.error.userMessage));
                }
              }
            },
            (error) => {
              clearTimeout(timer);
              stop();
              reject(error);
            },
          );
      });
    },
    { baseUrl: url.href, model, provider },
  );
  if (
    !result ||
    typeof result !== 'object' ||
    !('chunks' in result) ||
    Number(result.chunks) < 2 ||
    !('text' in result) ||
    !String(result.text).trim()
  )
    throw new Error('The endpoint did not deliver multiple text deltas for a real streamed reply.');
  await expect(pet.getByTestId('bubble')).toHaveAttribute('data-streaming', 'false');
  await expect(pet.getByTestId('bubble-content')).not.toHaveText('');
  console.log(
    JSON.stringify({
      acceptance: 'real-local-model-streaming',
      passed: true,
      baseUrl: url.href,
      model,
      provider,
      ...result,
    }),
  );
} finally {
  await app?.close();
  const target = resolve(directory),
    root = resolve(tmpdir());
  if (
    !target.toLowerCase().startsWith((root + sep).toLowerCase()) ||
    !basename(target).startsWith('littlellm-local-')
  ) {
    console.error('Cleanup refused an unexpected test-profile path.');
    process.exitCode = 1;
  } else await rm(target, { recursive: true, force: true });
}
