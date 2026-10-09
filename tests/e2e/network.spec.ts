import { test, expect, _electron } from '@playwright/test';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configSchema } from '../../src/shared/config';
import { launchEnvironment } from './environment';
test('main requests use the configured proxy and scoped self-signed trust is revoked live', async () => {
  test.setTimeout(60000);
  let proxyCalls = 0;
  const proxy = httpServer((_request, response) => {
    proxyCalls++;
    response.setHeader('Content-Type', 'application/json');
    response.end('{"data":[{"id":"proxied-model"}]}');
  });
  const tls = httpsServer(
    {
      key: await readFile('tests/fixtures/tls/localhost.key'),
      cert: await readFile('tests/fixtures/tls/localhost.crt'),
    },
    (_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end('{"data":[{"id":"trusted-model"}]}');
    },
  );
  await Promise.all([
    new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve)),
    new Promise<void>((resolve) => tls.listen(0, '127.0.0.1', resolve)),
  ]);
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-network-'));
  await writeFile(
    join(directory, 'config.json'),
    JSON.stringify(
      configSchema.parse({ llm: { timeoutMs: 5000 }, advanced: { proxyMode: 'direct' } }),
    ),
  );
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await pet.evaluate(
      async (port) => {
        await window.companion.patchConfig('llm', { baseUrl: 'http://model.invalid/v1' });
        await window.companion.patchConfig('advanced', {
          proxyMode: 'manual',
          proxyUrl: `http://127.0.0.1:${port}`,
          proxyBypass: '',
        });
      },
      (proxy.address() as AddressInfo).port,
    );
    expect(await pet.evaluate(() => window.companion.listModels())).toMatchObject({
      ok: true,
      value: [{ id: 'proxied-model' }],
    });
    expect(proxyCalls).toBe(1);
    await pet.evaluate(
      async (port) => {
        await window.companion.patchConfig('advanced', { proxyMode: 'direct' });
        await window.companion.patchConfig('llm', { baseUrl: `https://127.0.0.1:${port}/v1` });
      },
      (tls.address() as AddressInfo).port,
    );
    expect(await pet.evaluate(() => window.companion.listModels())).toMatchObject({ ok: false });
    await pet.evaluate(() => window.companion.patchConfig('advanced', { allowSelfSigned: true }));
    expect(await pet.evaluate(() => window.companion.listModels())).toMatchObject({
      ok: true,
      value: [{ id: 'trusted-model' }],
    });
    // The relaxed provider policy never changes the renderer's/default session.
    expect(
      await app.evaluate(
        async ({ session }, port) => {
          try {
            await session.defaultSession.fetch(`https://127.0.0.1:${port}/v1/models`);
            return 'accepted';
          } catch {
            return 'rejected';
          }
        },
        (tls.address() as AddressInfo).port,
      ),
    ).toBe('rejected');
    await pet.evaluate(() => window.companion.patchConfig('advanced', { allowSelfSigned: false }));
    expect(await pet.evaluate(() => window.companion.listModels())).toMatchObject({ ok: false });
    expect(proxyCalls).toBe(1);
  } finally {
    await app.close();
    proxy.closeAllConnections();
    tls.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => proxy.close(() => resolve())),
      new Promise<void>((resolve) => tls.close(() => resolve())),
    ]);
    await rm(directory, { recursive: true, force: true });
  }
});
