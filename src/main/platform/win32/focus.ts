import koffi from 'koffi';
type Handle = number | bigint;
let api: ReturnType<typeof load> | null = null;
function load() {
  const dll = koffi.load('user32.dll');
  return {
    foreground: dll.func('intptr_t __stdcall GetForegroundWindow()') as () => Handle,
    style: dll.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t window, int index)') as (
      value: Handle,
      index: number,
    ) => Handle,
    setStyle: dll.func(
      'intptr_t __stdcall SetWindowLongPtrW(intptr_t window, int index, intptr_t value)',
    ) as (value: Handle, index: number, style: Handle) => Handle,
    valid: dll.func('int __stdcall IsWindow(intptr_t window)') as (value: Handle) => number,
    foregroundSet: dll.func('int __stdcall SetForegroundWindow(intptr_t window)') as (
      value: Handle,
    ) => number,
  };
}
export function preventMouseActivation(handle: Buffer) {
  if (process.platform !== 'win32') return;
  api ??= load();
  const window = handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE());
  api.setStyle(window, -20, BigInt(api.style(window, -20)) | 0x08000000n);
}
export function foregroundWindow() {
  if (process.platform !== 'win32') return null;
  api ??= load();
  return api.foreground();
}
export function restoreForeground(value: Handle | null) {
  if (process.platform !== 'win32' || value === null) return;
  api ??= load();
  if (api.valid(value)) api.foregroundSet(value);
}
