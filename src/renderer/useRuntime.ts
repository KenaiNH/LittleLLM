import { useEffect, useState } from 'react';
import type { RuntimeStatus } from '../shared/diagnostics';
export function useRuntime() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  useEffect(() => {
    let active = true;
    void window.companion.getRuntime().then((result) => {
      if (active && result.ok) setRuntime(result.value);
    });
    const remove = window.companion.onRuntime(setRuntime);
    return () => {
      active = false;
      remove();
    };
  }, []);
  return runtime;
}
