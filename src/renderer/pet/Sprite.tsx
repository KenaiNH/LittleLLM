import { useEffect, useRef, useState } from 'react';
import type { SpriteAssets } from '../../shared/sprites';
import type { SpriteConfig } from '../../shared/config';
import type { SpriteState } from '../../shared/enums';
import { AnimationClock } from '../../shared/animation';
import { decodeSpriteAssets, closeSpriteAssets, type BitmapSet } from './spriteBitmaps';
import styles from './Sprite.module.css';
export function Sprite({
  assets,
  config,
  state,
  onComplete,
  fpsCap = 60,
}: {
  assets: SpriteAssets;
  config: SpriteConfig;
  state: SpriteState;
  onComplete?: () => void;
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
  const clockRef = useRef<{ key: string; clock: AnimationClock } | null>(null);
  const selected =
    state === 'listening'
      ? config.listeningBehavior === 'use-thinking'
        ? 'thinking'
        : config.listeningBehavior === 'custom' && assets.listening
          ? 'listening'
          : 'idle'
      : state;
  const asset = assets[selected] ?? assets.idle;
  const spec = config[selected] ?? config.idle;
  const scale = config.scale / (config.scaleMode === 'fixed' ? dpi : 1);
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
    const canvas = ref.current,
      frames = bitmaps?.[selected];
    if (!canvas || !frames?.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = Math.round(asset.width * scale * dpi);
    canvas.height = Math.round(asset.height * scale * dpi);
    ctx.imageSmoothingEnabled =
      config.pixelated === 'off' ||
      (config.pixelated === 'auto' && Math.max(asset.width, asset.height) > 128);
    const key = JSON.stringify([selected, spec.playbackMode, asset.frames]);
    if (clockRef.current?.key !== key)
      clockRef.current = {
        key,
        clock: new AnimationClock(
          asset.frames.map((f) => f.delayMs),
          spec.playbackMode,
        ),
      };
    const clock = clockRef.current.clock;
    let handle = 0,
      lastDraw = -1,
      lastPaint = -Infinity;
    const paint = (now: number) => {
      if (now - lastPaint >= 1000 / fpsCap) {
        lastPaint = now;
        const tick = clock.tick(now);
        const bitmap = frames[tick.frame];
        if (bitmap && tick.frame !== lastDraw) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.globalAlpha = config.opacity;
          if (config.flipHorizontal) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          ctx.restore();
          lastDraw = tick.frame;
          canvas.dataset.frame = String(tick.frame);
        }
        if (tick.returnToIdle) {
          onComplete?.();
          return;
        }
      }
      if (visible) handle = requestAnimationFrame(paint);
    };
    paint(performance.now());
    return () => {
      cancelAnimationFrame(handle);
      clock.pause();
    };
  }, [asset, bitmaps, config, dpi, fpsCap, onComplete, scale, selected, spec, visible]);
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
          width: asset.width * scale,
          height: asset.height * scale,
          imageRendering:
            config.pixelated === 'on' ||
            (config.pixelated === 'auto' && Math.max(asset.width, asset.height) <= 128)
              ? 'pixelated'
              : 'auto',
        }}
      />
      {error && <span role="alert">{error}</span>}
    </>
  );
}
