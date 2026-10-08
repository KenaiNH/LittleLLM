import { test, expect, _electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { launchEnvironment } from './environment';
test('real file and clipboard imports use managed thumbnails and encode images through all providers', async () => {
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += String(chunk);
    const body = JSON.parse(text);
    requests.push({ path: req.url ?? '', body });
    res.setHeader('Content-Type', 'text/event-stream');
    if (req.url === '/v1/messages')
      res.end(
        'data: ' +
          JSON.stringify({
            type: 'message_start',
            message: { usage: { input_tokens: 1, output_tokens: 0 } },
          }) +
          '\n\ndata: ' +
          JSON.stringify({
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Image received' },
          }) +
          '\n\ndata: {"type":"message_stop"}\n\n',
      );
    else if (req.url === '/api/show')
      res.end(JSON.stringify({ capabilities: ['completion', 'vision'] }));
    else if (req.url === '/api/chat')
      res.end(JSON.stringify({ message: { content: 'Image received' }, done: true }) + '\n');
    else
      res.end(
        'data: ' +
          JSON.stringify({
            choices: [{ delta: { content: 'Image received' }, finish_reason: 'stop' }],
          }) +
          '\n\ndata: [DONE]\n\n',
      );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture port');
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-images-')),
    source = join(directory, 'user-image.png');
  const png = await sharp({ create: { width: 2000, height: 1000, channels: 4, background: 'red' } })
    .png()
    .toBuffer();
  await writeFile(source, png);
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await pet.evaluate(async (base) => {
      const cfg = await window.companion.getConfig();
      if (!cfg.ok) throw new Error('No config');
      await window.companion.setConfig('llm', {
        ...cfg.value.llm,
        baseUrl: base + '/v1',
        model: 'vision-fixture',
        maxImageDim: '512',
        reencodeFormat: 'png',
      });
      await window.companion.setConfig('bubble', { ...cfg.value.bubble, textReveal: 'instant' });
      await window.companion.toggleInput();
    }, `http://127.0.0.1:${address.port}`);
    const input = (await app.windows()).find((page) => page.url().includes('view=input'));
    if (!input) throw new Error('No input');
    await input.getByRole('button', { name: 'Attach images', exact: true }).waitFor();
    await input.getByTestId('attachment-files').setInputFiles(source);
    await expect(input.getByRole('listitem')).toHaveCount(1);
    await expect(input.getByRole('img', { name: 'user-image.png' })).toHaveAttribute(
      'title',
      'user-image.png · 512×256',
    );
    // Exercise actual Electron clipboard while restoring every original format afterward.
    await app.evaluate(async ({ clipboard, ClipboardItem }, data) => {
      const original = await clipboard.read(),
        saved: Electron.ClipboardItem[] = [];
      for (const item of original) {
        const types: Record<string, Blob | Electron.ClipboardBookmark> = {};
        for (const type of item.types) types[type] = await item.getType(type);
        saved.push(new ClipboardItem(types));
      }
      (
        globalThis as typeof globalThis & { __restoreImagesClipboard?: () => Promise<void> }
      ).__restoreImagesClipboard = () => clipboard.write(saved);
      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([Buffer.from(data, 'base64')], { type: 'image/png' }),
        }),
      ]);
    }, png.toString('base64'));
    const clip = await input.evaluate(() => window.companion.attachClipboardImage());
    expect(clip.ok).toBe(true);
    await expect(input.getByRole('listitem')).toHaveCount(2);
    await input.getByRole('button', { name: 'Remove Clipboard image' }).click();
    await expect(input.getByRole('listitem')).toHaveCount(1);
    for (const provider of ['openai-compatible', 'anthropic', 'ollama'] as const) {
      if (provider !== 'openai-compatible') {
        await pet.evaluate(
          async ({ provider, base }) => {
            await window.companion.clearConversation();
            const cfg = await window.companion.getConfig();
            if (!cfg.ok) throw new Error('No config');
            await window.companion.setConfig('llm', { ...cfg.value.llm, provider, baseUrl: base });
            await window.companion.toggleInput();
          },
          { provider, base: `http://127.0.0.1:${address.port}` },
        );
        await input.getByTestId('attachment-files').setInputFiles(source);
        await expect(input.getByRole('listitem')).toHaveCount(1);
      }
      await input.getByRole('textbox', { name: 'Your response' }).fill('Describe this image');
      if (provider === 'openai-compatible')
        await input.screenshot({ path: test.info().outputPath('attachment-input.png') });
      await input.getByRole('button', { name: 'Send response' }).click();
      await expect(pet.getByTestId('bubble-content')).toContainText('Image received');
      await expect(pet.getByTestId('bubble')).toHaveAttribute('data-streaming', 'false');
      await expect(pet.getByRole('img', { name: 'user-image.png' })).toHaveCount(1);
      const request = requests
        .filter(
          (item) =>
            item.path ===
            (provider === 'ollama'
              ? '/api/chat'
              : provider === 'anthropic'
                ? '/v1/messages'
                : '/v1/chat/completions'),
        )
        .at(-1);
      const message = (request?.body.messages as { content: unknown; images?: string[] }[]).at(-1);
      const encoded =
        provider === 'ollama'
          ? message?.images?.[0]
          : provider === 'anthropic'
            ? (message?.content as { source?: { data: string } }[])[0]?.source?.data
            : (message?.content as { image_url?: { url: string } }[])[1]?.image_url?.url.split(
                ',',
              )[1];
      expect(encoded).toBeTruthy();
      const metadata = await sharp(Buffer.from(encoded ?? '', 'base64')).metadata();
      expect(metadata.width).toBe(512);
    }
    await pet.evaluate(async () => {
      const cfg = await window.companion.getConfig();
      if (cfg.ok)
        await window.companion.setConfig('llm', {
          ...cfg.value.llm,
          provider: 'openai-compatible',
          model: 'gpt-3.5-turbo',
        });
      await window.companion.toggleInput();
    });
    await expect(input.getByRole('button', { name: 'Attach images', exact: true })).toBeDisabled();
    await input.getByTestId('attachment-files').setInputFiles(source);
    await expect(input.getByRole('alert')).toContainText('text-only');
    await expect(input.getByRole('listitem')).toHaveCount(0);
  } finally {
    await app.evaluate(
      async () =>
        await (
          globalThis as typeof globalThis & { __restoreImagesClipboard?: () => Promise<void> }
        ).__restoreImagesClipboard?.(),
    );
    await app.close();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});
