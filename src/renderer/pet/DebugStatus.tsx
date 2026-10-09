import { useEffect, useRef } from 'react';
export function DebugStatus({
  state,
  metrics,
}: {
  state: string;
  metrics: () => { rms: number; queue: number };
}) {
  const ref = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    const update = () => {
      const value = metrics();
      if (ref.current)
        ref.current.textContent = `${state} · audio queue ${value.queue} · RMS ${value.rms.toFixed(3)}`;
    };
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [state, metrics]);
  return (
    <output
      ref={ref}
      aria-label="Companion state and audio diagnostics"
      style={{
        position: 'absolute',
        top: 16,
        left: 0,
        font: '11px Consolas',
        background: '#000c',
        color: '#fff',
        pointerEvents: 'none',
      }}
    />
  );
}
