import { useEffect, useRef, useState } from 'react';
import type { SpriteAssets } from '../../shared/sprites';
import type { SpriteState } from '../../shared/enums';
import { AnimationClock } from '../../shared/animation';
import { decodeSpriteAssets, closeSpriteAssets, type BitmapSet } from './spriteBitmaps';
import type { SpriteScene } from './useSpriteScene';
import styles from './Sprite.module.css';

export function Sprite({
  assets,
  scene,
  state,
  onFadeEnd,
  fpsCap = 60,
}: {
  assets: SpriteAssets;
  scene: SpriteScene;
  state: SpriteState;
  onFadeEnd: (id: number) => void;
  fpsCap?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [decodedSet, setBitmaps] = useState<{
    bitmaps: BitmapSet;
    assets: SpriteAssets;
    dpi: number;
  } | null>(null);
  const [dpi, setDpi] = useState(window.devicePixelRatio);
  const [visible, setVisible] = useState(!document.hidden);
  const [error, setError] = useState<string | null>(null);
  const bitmaps =
    decodedSet?.assets === assets && decodedSet.dpi === dpi ? decodedSet.bitmaps : null;
  const run = useRef<{
    id: number;
    clock: AnimationClock;
    previous: HTMLCanvasElement | null;
    elapsed: number;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let decoded: BitmapSet | undefined;
    setBitmaps(null);
    void decodeSpriteAssets(assets, controller.signal)
      .then((value) => {
        decoded = value;
        setBitmaps({ bitmaps: value, assets, dpi });
        setError(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Sprite images could not be decoded.');
      });
    return () => {
      controller.abort();
      if (decoded) closeSpriteAssets(decoded);
    };
  }, [assets, dpi]);
  useEffect(() => {
    const removeDpi = window.companion.onDpi(setDpi),
      removeVisibility = window.companion.onVisibility(setVisible);
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => {
      removeDpi();
      removeVisibility();
      document.removeEventListener('visibilitychange', change);
    };
  }, []);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // Snapshot the last composite before resizing. Rapid transitions continue
    // from what was visible rather than jumping to the old target image.
    if (run.current?.id !== scene.id) {
      let previous: HTMLCanvasElement | null = null;
      if (scene.previous && canvas.width && canvas.height && run.current) {
        previous = document.createElement('canvas');
        previous.width = canvas.width;
        previous.height = canvas.height;
        previous.getContext('2d')?.drawImage(canvas, 0, 0);
      }
      run.current = {
        id: scene.id,
        previous,
        elapsed: previous ? 0 : scene.duration,
        clock: new AnimationClock(
          scene.target.asset.frames.map((f) => f.delayMs),
          // Binding C23 preserves all four modes. Default idle loops; configured
          // non-looping animation holds its final frame while its state is active.
          scene.target.spec.playbackMode,
        ),
      };
    }
    const animation = run.current,
      frames = bitmaps?.[scene.target.selected];
    if (!animation || !frames?.length) return;
    canvas.width = Math.max(1, Math.round(scene.geometry.width * dpi));
    canvas.height = Math.max(1, Math.round(scene.geometry.height * dpi));
    const ctx = canvas.getContext('2d'),
      composite = document.createElement('canvas');
    composite.width = canvas.width;
    composite.height = canvas.height;
    const offscreen = composite.getContext('2d');
    if (!ctx || !offscreen) return;
    let handle = 0,
      lastFrame = -1,
      lastProgress = -1,
      lastPaint = -Infinity,
      previousTime: number | null = null;
    const paint = (now: number) => {
      if (now - lastPaint >= 1000 / fpsCap) {
        lastPaint = now;
        if (visible && previousTime !== null) animation.elapsed += Math.max(0, now - previousTime);
        previousTime = now;
        const tick = animation.clock.tick(now),
          bitmap = frames[tick.frame];
        const progress = scene.previous ? Math.min(1, animation.elapsed / scene.duration) : 1;
        if (bitmap && (tick.frame !== lastFrame || progress !== lastProgress)) {
          offscreen.clearRect(0, 0, composite.width, composite.height);
          offscreen.globalCompositeOperation = 'source-over';
          offscreen.globalAlpha = 1 - progress;
          if (animation.previous && scene.previous)
            offscreen.drawImage(
              animation.previous,
              (scene.geometry.anchor.x - scene.previous.anchor.x) * dpi,
              (scene.geometry.anchor.y - scene.previous.anchor.y) * dpi,
              scene.previous.width * dpi,
              scene.previous.height * dpi,
            );
          // Add weighted premultiplied RGBA offscreen. Source-over would darken
          // transparent edges and reduce opaque alpha at the midpoint.
          offscreen.globalCompositeOperation = 'lighter';
          offscreen.globalAlpha = progress * scene.target.opacity;
          offscreen.imageSmoothingEnabled = !scene.target.pixelated;
          const g = scene.target.geometry,
            x = (scene.geometry.anchor.x - g.anchor.x) * dpi,
            y = (scene.geometry.anchor.y - g.anchor.y) * dpi;
          offscreen.save();
          if (scene.target.flip) {
            offscreen.translate(x + g.width * dpi, y);
            offscreen.scale(-1, 1);
          } else offscreen.translate(x, y);
          offscreen.drawImage(bitmap, 0, 0, g.width * dpi, g.height * dpi);
          offscreen.restore();
          ctx.globalCompositeOperation = 'copy';
          ctx.drawImage(composite, 0, 0);
          lastFrame = tick.frame;
          lastProgress = progress;
          canvas.dataset.frame = String(tick.frame);
          canvas.dataset.fade = String(progress);
        }
        if (scene.previous && progress === 1) {
          animation.previous = null;
          onFadeEnd(scene.id);
        }
      }
      if (
        visible &&
        ((frames.length > 1 && !animation.clock.finished) ||
          (scene.previous && animation.elapsed < scene.duration))
      )
        handle = requestAnimationFrame(paint);
    };
    paint(performance.now());
    return () => {
      cancelAnimationFrame(handle);
      animation.clock.pause();
    };
  }, [bitmaps, dpi, fpsCap, onFadeEnd, scene, state, visible]);
  return (
    <>
      <canvas
        ref={ref}
        data-testid="sprite"
        data-state={state}
        data-running={visible}
        aria-label={state + ' companion sprite'}
        className={styles.sprite}
        style={{
          width: scene.geometry.width,
          height: scene.geometry.height,
          imageRendering: scene.target.pixelated ? 'pixelated' : 'auto',
        }}
      />
      {error && <span role="alert">{error}</span>}
    </>
  );
}
