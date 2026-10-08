import { useCallback, useState } from 'react';
import type { SpriteAssets, SpriteAsset } from '../../shared/sprites';
import type { SpriteConfig, SpriteStateConfig } from '../../shared/config';
import type { SpriteState } from '../../shared/enums';
import { frameGeometry, unionGeometry, type SpriteGeometry } from '../../shared/spriteGeometry';
export type SpriteLayer = {
  selected: SpriteState;
  asset: SpriteAsset;
  spec: SpriteStateConfig;
  geometry: SpriteGeometry;
  flip: boolean;
  opacity: number;
  pixelated: boolean;
};
export type SpriteScene = {
  id: number;
  key: string;
  target: SpriteLayer;
  geometry: SpriteGeometry;
  previous: SpriteGeometry | null;
  layers: SpriteLayer[];
  duration: number;
};
export function useSpriteScene(
  assets: SpriteAssets | null,
  config: SpriteConfig | undefined,
  state: SpriteState,
  dpi: number,
) {
  const [scene, setScene] = useState<SpriteScene | null>(null);
  if (assets && config) {
    const selected =
      state === 'listening'
        ? config.listeningBehavior === 'use-thinking'
          ? 'thinking'
          : config.listeningBehavior === 'custom' && assets.listening
            ? 'listening'
            : 'idle'
        : state;
    const asset = assets[selected] ?? assets.idle,
      spec = config[selected] ?? config.idle;
    const scale = config.scale / (config.scaleMode === 'fixed' ? dpi : 1);
    const key = JSON.stringify([
      selected,
      asset,
      spec,
      scale,
      config.flipHorizontal,
      config.opacity,
      config.pixelated,
    ]);
    if (key !== scene?.key) {
      const target: SpriteLayer = {
        selected,
        asset,
        spec,
        geometry: frameGeometry(
          asset.width,
          asset.height,
          scale,
          spec.anchor,
          config.flipHorizontal,
        ),
        flip: config.flipHorizontal,
        opacity: config.opacity,
        pixelated:
          config.pixelated === 'on' ||
          (config.pixelated === 'auto' && Math.max(asset.width, asset.height) <= 128),
      };
      const previous = config.transition === 'crossfade' ? (scene?.geometry ?? null) : null;
      setScene({
        id: (scene?.id ?? 0) + 1,
        key,
        target,
        geometry: previous ? unionGeometry(previous, target.geometry) : target.geometry,
        previous,
        layers: previous ? [...(scene?.layers ?? []), target] : [target],
        duration: config.crossfadeMs,
      });
    }
  }
  const finish = useCallback(
    (id: number) =>
      setScene((current) =>
        current?.id === id && current.previous
          ? {
              ...current,
              geometry: current.target.geometry,
              previous: null,
              layers: [current.target],
            }
          : current,
      ),
    [],
  );
  return { scene, finish };
}
