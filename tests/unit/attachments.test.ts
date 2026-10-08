import { expect, it } from 'vitest';
import sharp from 'sharp';
import { configSchema } from '../../src/shared/config';
import {
  normalizeAttachment,
  AttachmentStore,
  ATTACHMENT_LIMIT,
} from '../../src/main/services/attachments';
import {
  openAiMessages,
  anthropicMessages,
  ollamaMessages,
} from '../../src/main/llm/imageEncoding';
import { knownImageSupport, imageCapability } from '../../src/main/llm/capabilities';
import { historyMessages } from '../../src/main/llm/history';
import type { LLMProvider } from '../../src/main/llm/types';
const cfg = configSchema.parse({});
const image = { mediaType: 'image/png' as const, data: 'YQ==', width: 1, height: 1 };
it('strips metadata, applies dimensions/formats, and emits a small independent thumbnail', async () => {
  const source = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: 'red' },
  })
    .withMetadata({ exif: { IFD0: { Artist: 'Private author' } } })
    .jpeg()
    .toBuffer();
  const result = await normalizeAttachment(
    source,
    { ...cfg.llm, maxImageDim: '512' },
    'picture.jpg',
  );
  expect(result.image).toMatchObject({ mediaType: 'image/jpeg', width: 512, height: 256 });
  const metadata = await sharp(Buffer.from(result.image.data, 'base64')).metadata();
  expect(metadata.exif).toBeUndefined();
  expect(result.view.thumbnail).toMatch(/^data:image\/png;base64,/);
  const thumb = await sharp(
    Buffer.from(result.view.thumbnail.split(',')[1] ?? '', 'base64'),
  ).metadata();
  expect(thumb.width).toBeLessThanOrEqual(160);
  for (const format of ['png', 'webp', 'original'] as const) {
    const item = await normalizeAttachment(
      source,
      { ...cfg.llm, reencodeFormat: format, maxImageDim: 'none' },
      'image',
    );
    expect(item.image.width).toBe(2000);
    expect(item.image.mediaType).toBe(format === 'original' ? 'image/jpeg' : 'image/' + format);
  }
});
it('rejects spoofed/oversized input and keeps prior attachments after a failed batch', async () => {
  await expect(normalizeAttachment(Buffer.from('fake.png'), cfg.llm, 'fake')).rejects.toThrow(
    'contents',
  );
  await expect(
    normalizeAttachment(Buffer.alloc(ATTACHMENT_LIMIT + 1), cfg.llm, 'large'),
  ).rejects.toThrow('10 MiB');
  const store = new AttachmentStore(() => ({ ...cfg, llm: { ...cfg.llm, maxAttachments: 2 } }));
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: 'blue' } })
    .png()
    .toBuffer();
  await store.add([{ bytes, name: 'first' }]);
  await expect(store.add([{ bytes: Buffer.from('bad'), name: 'bad' }])).rejects.toThrow();
  expect(store.views.map((item) => item.name)).toEqual(['first']);
  await expect(
    store.add([
      { bytes, name: 'second' },
      { bytes, name: 'third' },
    ]),
  ).rejects.toThrow('at most 2');
  const id = store.views[0]?.id;
  if (id) store.remove(id);
  expect(store.images).toEqual([]);
});
it('encodes the same retained images correctly for all three providers', () => {
  const messages = [{ role: 'user' as const, content: 'Describe', images: [image] }];
  expect(openAiMessages(messages, 'low')[0]?.content).toEqual([
    { type: 'text', text: 'Describe' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==', detail: 'low' } },
  ]);
  expect(anthropicMessages(messages)[0]?.content).toEqual([
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'YQ==' } },
    { type: 'text', text: 'Describe' },
  ]);
  expect(ollamaMessages(messages)[0]).toEqual({
    role: 'user',
    content: 'Describe',
    images: ['YQ=='],
  });
});
it('discards an import cleared while decoding instead of repopulating the next message', async () => {
  const store = new AttachmentStore(() => cfg);
  const bytes = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: 'blue' },
  })
    .png()
    .toBuffer();
  const task = store.add([{ bytes, name: 'pending' }]);
  store.clear();
  await expect(task).rejects.toMatchObject({ normalized: { code: 'ABORTED' } });
  expect(store.views).toEqual([]);
});
it('gates known text-only models, preserves uncertainty on an absent probe, and respects explicit positive/negative probes', async () => {
  expect(knownImageSupport('ollama', 'smollm2:135m')).toBe(false);
  expect(knownImageSupport('ollama', 'moondream:latest')).toBe(true);
  const provider = {
    id: 'ollama',
    supportsImages: true,
    imageSupport: async () => null,
  } as unknown as LLMProvider;
  const config = {
    ...cfg,
    llm: { ...cfg.llm, provider: 'ollama' as const, model: 'smollm2:135m' },
  };
  expect((await imageCapability(config, provider)).allowed).toBe(false);
  expect(
    await imageCapability({ ...config, llm: { ...config.llm, model: 'unrecognized' } }, provider),
  ).toMatchObject({ allowed: true, supportsImages: null });
  expect(
    (await imageCapability(config, { ...provider, imageSupport: async () => true })).allowed,
  ).toBe(true);
  expect(
    (await imageCapability({ ...config, llm: { ...config.llm, enableImages: false } }, provider))
      .allowed,
  ).toBe(false);
});
it('budgets image cost and trims whole old exchanges while retaining current image parts', () => {
  const old = [{ user: 'first', assistant: 'reply', images: [image] }];
  expect(
    historyMessages(
      old,
      'current',
      { ...cfg.llm, contextMode: 'token-budget', tokenBudget: 512 },
      'system',
      [],
      [image],
    ),
  ).toEqual([{ role: 'user', content: 'current', images: [image] }]);
  const low = historyMessages(
    old,
    'current',
    { ...cfg.llm, imageDetail: 'low', contextMode: 'token-budget', tokenBudget: 512 },
    'system',
    [],
    [image],
  );
  expect(low).toHaveLength(3);
  expect(low[0]?.images).toEqual([image]);
});
