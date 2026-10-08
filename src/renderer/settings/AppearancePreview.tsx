import { useEffect, useRef, useState } from 'react';
import type { Config } from '../../shared/config';
import type { PetViewport } from '../../shared/petLayout';
import { Bubble } from '../pet/Bubble';
import styles from './Settings.module.css';
const measure = () => {};
export function AppearancePreview({ config }: { config: Config }) {
  const root = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(640);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(160, element.clientWidth - 36)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const area = { x: 0, y: 0, width, height: 420 };
  const viewport: PetViewport = {
    window: area,
    workArea: area,
    sprite: { ...area, width: 128, height: 128 },
    bubble: null,
    dpi: 1,
    dark: config.window.settingsDarkMode,
    placement: 'above',
    mirror: false,
  };
  return (
    <section className={styles.section}>
      <h2>Live preview</h2>
      <div ref={root} className={styles.preview}>
        <Bubble
          name="Companion"
          text="You can adjust the bubble while keeping your companion in view."
          config={config}
          viewport={viewport}
          onMeasure={measure}
        />
      </div>
    </section>
  );
}
