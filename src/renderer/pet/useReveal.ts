import { useEffect, useRef, useState } from 'react';
export function useReveal(text: string, mode: 'instant' | 'char' | 'word', rate: number) {
  const previous = useRef(''),
    units = useRef<string[]>([]),
    count = useRef(0);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (!text.startsWith(previous.current)) count.current = 0;
    previous.current = text;
    units.current = mode === 'word' ? (text.match(/\s*\S+\s*/g) ?? [text]) : Array.from(text);
    count.current = Math.min(count.current, units.current.length);
    if (mode === 'instant') {
      count.current = units.current.length;
      setValue(text);
    } else setValue(units.current.slice(0, Math.floor(count.current)).join(''));
  }, [text, mode]);
  useEffect(() => {
    if (mode === 'instant') return;
    let handle = 0,
      last = performance.now();
    const paint = (now: number) => {
      count.current = Math.min(units.current.length, count.current + ((now - last) * rate) / 1000);
      last = now;
      setValue(units.current.slice(0, Math.floor(count.current)).join(''));
      if (count.current < units.current.length) handle = requestAnimationFrame(paint);
    };
    handle = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(handle);
  }, [text, mode, rate]);
  return value;
}
