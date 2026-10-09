import koffi from 'koffi';
type Handle = number | bigint;
function load() {
  const user = koffi.load('user32.dll'),
    shell = koffi.load('shell32.dll');
  koffi.struct('LittleLLMFullscreenRect', {
    left: 'int32_t',
    top: 'int32_t',
    right: 'int32_t',
    bottom: 'int32_t',
  });
  return {
    state: shell.func('int32_t __stdcall SHQueryUserNotificationState(_Out_ uint32_t *state)') as (
      state: number[],
    ) => number,
    foreground: user.func('intptr_t __stdcall GetForegroundWindow()') as () => Handle,
    className: user.func(
      'int __stdcall GetClassNameW(intptr_t window, _Out_ uint16_t *name, int count)',
    ) as (window: Handle, name: Buffer, count: number) => number,
    rect: user.func(
      'int __stdcall GetWindowRect(intptr_t window, _Out_ LittleLLMFullscreenRect *rect)',
    ) as (
      window: Handle,
      rect: { left: number; top: number; right: number; bottom: number },
    ) => number,
    style: user.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t window, int index)') as (
      window: Handle,
      index: number,
    ) => Handle,
  };
}
let api: ReturnType<typeof load> | null = null;
export function fullscreenState(
  area: { x: number; y: number; width: number; height: number },
  own: Buffer[],
) {
  if (process.platform !== 'win32') return { fullscreen: false, game: false };
  api ??= load();
  const state = [0];
  api.state(state);
  const game = state[0] === 3,
    foreground = api.foreground();
  const name = Buffer.alloc(512);
  api.className(foreground, name, 256);
  if (
    /^(Progman|WorkerW|Shell_TrayWnd|Shell_SecondaryTrayWnd)$/.test(
      name.toString('utf16le').split('\0')[0] ?? '',
    )
  )
    return { fullscreen: false, game: false };
  if (
    own.some(
      (handle) =>
        BigInt(foreground) ===
        (handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())),
    )
  )
    return { fullscreen: false, game };
  const rect = { left: 0, top: 0, right: 0, bottom: 0 };
  // Captioned maximized windows are desktop apps; borderless screen-covering
  // foreground windows and the shell notification state identify fullscreen.
  const fullscreen =
    [2, 4].includes(state[0] ?? 0) ||
    Boolean(
      api.rect(foreground, rect) &&
      !(BigInt(api.style(foreground, -16)) & 0x00c00000n) &&
      rect.left <= area.x &&
      rect.top <= area.y &&
      rect.right >= area.x + area.width &&
      rect.bottom >= area.y + area.height,
    );
  return { fullscreen, game };
}
