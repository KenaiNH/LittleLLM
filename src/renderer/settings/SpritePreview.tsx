import { useEffect, useRef, useState } from 'react';
import type { Config, SpriteStateConfig } from '../../shared/config';
import type { SpriteAsset } from '../../shared/sprites';
import { AnimationClock } from '../../shared/animation';
import styles from './Settings.module.css';
export function SpritePreview({
  asset,
  spec,
  config,
  name,
  driver,
}: {
  asset: SpriteAsset;
  spec: SpriteStateConfig;
  config: Config;
  name: string;
  driver?: () => number | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(asset.frames.length > 1),
    [ready, setReady] = useState(0);
  const currentFrame = useRef(0),
    [seekEpoch, setSeekEpoch] = useState(0);
  const bitmaps = useRef<ImageBitmap[]>([]),
    clock = useRef(
      new AnimationClock(
        asset.frames.map((frame) => frame.delayMs),
        spec.playbackMode,
      ),
    );
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const images: ImageBitmap[] = [];
    void Promise.all(
      asset.frames.map(async (frame) => {
        const response = await fetch(frame.url, { signal: controller.signal });
        if (!response.ok) throw new Error('Preview image unavailable');
        const image = await createImageBitmap(await response.blob());
        if (cancelled) image.close();
        else images.push(image);
        return image;
      }),
    )
      .then((decoded) => {
        if (cancelled) return;
        bitmaps.current = decoded;
        clock.current = new AnimationClock(
          asset.frames.map((frame) => frame.delayMs),
          spec.playbackMode,
        );
        currentFrame.current = 0;
        setFrame(0);
        setPlaying(asset.frames.length > 1);
        setReady((value) => value + 1);
      })
      .catch(() => {
        if (!cancelled) setPlaying(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
      images.forEach((image) => image.close());
      bitmaps.current = [];
    };
  }, [asset, spec.playbackMode]);
  useEffect(() => {
    let animation = 0;
    clock.current.pause();
    const draw = (now: number) => {
      const element = canvas.current,
        context = element?.getContext('2d');
      if (element && context) {
        const pixelRatio = window.devicePixelRatio,
          width = 294,
          height = 110;
        element.width = Math.round(width * pixelRatio);
        element.height = Math.round(height * pixelRatio);
        context.scale(pixelRatio, pixelRatio);
        context.clearRect(0, 0, width, height);
        let next = currentFrame.current;
        const driven = driver?.();
        if (driven !== undefined && driven !== null) next = driven;
        else if (playing && !document.hidden) next = clock.current.tick(now).frame;
        else clock.current.pause();
        if (next !== currentFrame.current) {
          currentFrame.current = next;
          setFrame(next);
        }
        const image = bitmaps.current[next];
        if (image) {
          const ratio = Math.min(1, width / asset.width, height / asset.height),
            w = asset.width * ratio,
            h = asset.height * ratio;
          context.globalAlpha = config.sprite.opacity;
          context.imageSmoothingEnabled =
            config.sprite.pixelated === 'off' ||
            (config.sprite.pixelated === 'auto' && Math.max(asset.width, asset.height) > 128);
          context.translate(width / 2, height / 2);
          if (config.sprite.flipHorizontal) context.scale(-1, 1);
          context.drawImage(image, -w / 2, -h / 2, w, h);
        }
      }
      if (playing || driver) animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  }, [
    asset,
    ready,
    playing,
    config.sprite.opacity,
    config.sprite.pixelated,
    config.sprite.flipHorizontal,
    driver,
    seekEpoch,
  ]);
  return (
    <div className={styles.spritePreview}>
      <canvas
        ref={canvas}
        aria-label={`${name} sprite preview`}
        style={{ width: '100%', height: 110 }}
      />
      {asset.frames.length > 1 && (
        <div className={styles.previewControls}>
          <button
            className={styles.textButton}
            aria-label={`${playing ? 'Pause' : 'Play'} ${name} preview`}
            onClick={() => {
              if (clock.current.finished) clock.current.reset();
              setPlaying(!playing);
            }}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <input
            aria-label={`${name} frame scrubber`}
            type="range"
            min={0}
            max={asset.frames.length - 1}
            value={frame}
            onChange={(event) => {
              const next = Number(event.target.value);
              clock.current.seek(next);
              currentFrame.current = next;
              setFrame(next);
              setPlaying(false);
              setSeekEpoch((value) => value + 1);
            }}
          />
          <span>
            {frame + 1} / {asset.frames.length}
          </span>
        </div>
      )}
    </div>
  );
}
