import koffi from 'koffi';
type Handle = number | bigint;
type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };
function loadApi() {
  const dll = koffi.load('user32.dll');
  koffi.struct('LittleLLMPoint', { x: 'int32_t', y: 'int32_t' });
  koffi.struct('LittleLLMRect', {
    left: 'int32_t',
    top: 'int32_t',
    right: 'int32_t',
    bottom: 'int32_t',
  });
  return {
    next: dll.func('intptr_t __stdcall GetWindow(intptr_t window, uint32_t command)') as (
      window: Handle,
      command: number,
    ) => Handle,
    visible: dll.func('int __stdcall IsWindowVisible(intptr_t window)') as (
      window: Handle,
    ) => number,
    iconic: dll.func('int __stdcall IsIconic(intptr_t window)') as (window: Handle) => number,
    style: dll.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t window, int index)') as (
      window: Handle,
      index: number,
    ) => Handle,
    setStyle: dll.func(
      'intptr_t __stdcall SetWindowLongPtrW(intptr_t window, int index, intptr_t value)',
    ) as (window: Handle, index: number, value: Handle) => Handle,
    at: dll.func('intptr_t __stdcall WindowFromPoint(LittleLLMPoint point)') as (
      point: Point,
    ) => Handle,
    isChild: dll.func('int __stdcall IsChild(intptr_t parent, intptr_t child)') as (
      parent: Handle,
      child: Handle,
    ) => number,
    bounds: dll.func('int __stdcall GetWindowRect(intptr_t window, _Out_ LittleLLMRect *rect)') as (
      window: Handle,
      rect: Rect,
    ) => number,
    client: dll.func(
      'int __stdcall ScreenToClient(intptr_t window, _Inout_ LittleLLMPoint *point)',
    ) as (window: Handle, point: Point) => number,
    child: dll.func(
      'intptr_t __stdcall ChildWindowFromPointEx(intptr_t parent, LittleLLMPoint point, uint32_t flags)',
    ) as (parent: Handle, point: Point, flags: number) => Handle,
    send: dll.func(
      'intptr_t __stdcall SendMessageTimeoutW(intptr_t window, uint32_t message, uintptr_t wParam, intptr_t lParam, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)',
    ) as (
      window: Handle,
      message: number,
      wParam: Handle,
      lParam: Handle,
      flags: number,
      timeout: number,
      result: Handle[],
    ) => Handle,
  };
}
let api: ReturnType<typeof loadApi> | null = null;
export function forwardWheel(
  nativeHandle: Buffer,
  point: Point,
  event: { deltaX: number; deltaY: number; mode: 0 | 1 | 2; ctrl: boolean; shift: boolean },
): void {
  if (process.platform !== 'win32') throw new Error('Wheel pass-through requires Windows');
  api ??= loadApi();
  const own =
    nativeHandle.length === 8
      ? nativeHandle.readBigUInt64LE()
      : BigInt(nativeHandle.readUInt32LE());
  let target: Handle = api.next(own, 2),
    found = false;
  const visited = new Set<string>();
  while (target && !visited.has(String(target)) && visited.size < 512) {
    visited.add(String(target));
    const rect = { left: 0, top: 0, right: 0, bottom: 0 };
    if (
      api.visible(target) &&
      !api.iconic(target) &&
      (BigInt(api.style(target, -20)) & 0x20n) === 0n &&
      api.bounds(target, rect) &&
      point.x >= rect.left &&
      point.x < rect.right &&
      point.y >= rect.top &&
      point.y < rect.bottom
    ) {
      found = true;
      break;
    }
    target = api.next(target, 2);
  }
  if (!found) throw new Error('No underlying wheel target');
  // Route to the control under the pointer, including native scrollable children.
  for (let depth = 0; depth < 32; depth++) {
    const local = { ...point };
    if (!api.client(target, local)) break;
    const child = api.child(target, local, 7);
    if (!child || child === target) break;
    target = child;
  }
  const factor = event.mode === 0 ? 1.2 : event.mode === 1 ? 40 : 120,
    keys = (event.ctrl ? 8 : 0) | (event.shift ? 4 : 0),
    position = BigInt(((Math.round(point.y) & 0xffff) << 16) | (Math.round(point.x) & 0xffff));
  // Chromium checks WindowFromPoint again during wheel handling. Exclude our
  // layered window for this synchronous dispatch, then restore its exact style.
  const style = api.style(own, -20);
  api.setStyle(own, -20, BigInt(style) | 0x80020n);
  const under = api.at(point);
  if (BigInt(under) === own || api.isChild(own, under)) {
    api.setStyle(own, -20, style);
    throw new Error('Unable to exclude companion from wheel routing');
  }
  try {
    for (const [delta, message, sign] of [
      [event.deltaY, 0x020a, -1],
      [event.deltaX, 0x020e, 1],
    ]) {
      if (delta === undefined || message === undefined || sign === undefined || !delta) continue;
      const amount = Math.max(-32767, Math.min(32767, Math.round(delta * factor * sign)));
      if (
        !api.send(
          target,
          message,
          BigInt(((amount & 0xffff) << 16) | keys) & 0xffffffffn,
          position,
          2,
          100,
          [0],
        )
      )
        throw new Error('Windows refused wheel forwarding');
    }
  } finally {
    api.setStyle(own, -20, style);
  }
}
