import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configSchema, personaCardSchema } from '../../src/shared/config';
import { launchEnvironment } from './environment';
import ffi from 'koffi';
test('native hotkeys focus/restore input, toggle visibility, send clipboard and cycle personas', async () => {
  test.setTimeout(60000);
  test.skip(process.platform !== 'win32');
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-shortcuts-'));
  const first = personaCardSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'First',
    }),
    second = { ...first, id: '00000000-0000-4000-8000-000000000002', name: 'Second' };
  await writeFile(
    join(directory, 'config.json'),
    JSON.stringify(
      configSchema.parse({
        llm: { provider: 'mock', model: 'echo', mockReplySpeed: 1000, enableImages: false },
        advanced: { developerMode: true },
        window: { fullscreenBehavior: 'never' },
        bubble: { dwellMs: 0 },
        hotkeys: {
          focus: 'Control+Shift+F10',
          visibility: 'Control+Shift+F11',
          clipboard: 'Control+Shift+F9',
          clickThrough: 'Control+Shift+F8',
          nextPersona: 'Control+Shift+F7',
        },
        persona: { enabled: true, activeId: first.id, library: [first, second], onSwitch: 'keep' },
      }),
    ),
  );
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await app.evaluate(async ({ BrowserWindow, clipboard }) => {
      const state = globalThis as unknown as { originalClipboard?: Electron.ClipboardItem[] };
      state.originalClipboard = await clipboard.read();
      const backdrop = new BrowserWindow({
        width: 300,
        height: 150,
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      await backdrop.loadURL('data:text/html,<p>Temporary native focus acceptance window</p>');
      backdrop.show();
      backdrop.focus();
    });
    // Window activation is asynchronous on Windows. Establish the intended
    // foreground before the shortcut captures the window to restore later.
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((win) => win.webContents.getURL().startsWith('data:'))
            ?.isFocused(),
        ),
      )
      .toBe(true);
    const key = async (code: number) => {
      const native = ffi
        .load('user32.dll')
        .func(
          'void __stdcall keybd_event(uint8_t key, uint8_t scan, uint32_t flags, uintptr_t extra)',
        );
      try {
        native(17, 0, 0, 0);
        native(16, 0, 0, 0);
        native(code, 0, 0, 0);
      } finally {
        native(code, 0, 2, 0);
        native(16, 0, 2, 0);
        native(17, 0, 2, 0);
      }
    };
    await key(121);
    await expect.poll(() => app.windows().length).toBe(3);
    const input = app.windows().find((page) => page.url().includes('view=input'));
    if (!input) throw new Error('Input missing');
    await expect(input.getByRole('textbox', { name: 'Your response' })).toBeFocused();
    await input.evaluate(() => window.companion.closeInput());
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((win) => win.webContents.getURL().startsWith('data:'))
            ?.isFocused(),
        ),
      )
      .toBe(true);
    await key(122);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((win) => win.webContents.getURL().includes('view=pet'))
            ?.isVisible(),
        ),
      )
      .toBe(false);
    await key(122);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((win) => win.webContents.getURL().includes('view=pet'))
            ?.isVisible(),
        ),
      )
      .toBe(true);
    await app.evaluate(({ clipboard }) => clipboard.writeText('Native clipboard acceptance'));
    await key(120);
    await expect
      .poll(() => pet.getByTestId('bubble-content').innerText())
      .toBe('Native clipboard acceptance');
    await key(119);
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const cfg = await window.companion.getConfig();
          return cfg.ok && cfg.value.advanced.clickThrough;
        }),
      )
      .toBe('never');
    await key(118);
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const cfg = await window.companion.getConfig();
          return cfg.ok && cfg.value.persona.activeId;
        }),
      )
      .toBe(second.id);
    await expect(pet.getByRole('status')).toHaveText('Persona: Second');
  } finally {
    await app
      .evaluate(async ({ clipboard }) => {
        const state = globalThis as unknown as { originalClipboard?: Electron.ClipboardItem[] };
        if (state.originalClipboard?.length) await clipboard.write(state.originalClipboard);
        else await clipboard.clear();
      })
      .catch(() => undefined);
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
