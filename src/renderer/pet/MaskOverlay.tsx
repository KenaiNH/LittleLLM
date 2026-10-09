import { useEffect, useRef } from 'react';
import type { SpriteScene } from './useSpriteScene';
export function MaskOverlay({ scene, threshold }: { scene: SpriteScene; threshold: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    void window.companion.getSpriteMasks().then((result) => {
      const element = canvas.current;
      if (disposed || !result.ok || !element) return;
      element.width = Math.max(1, Math.ceil(scene.geometry.width));
      element.height = Math.max(1, Math.ceil(scene.geometry.height));
      const ctx = element.getContext('2d');
      if (!ctx) return;
      for (const layer of scene.layers) {
        const mask = result.value[layer.selected] ?? result.value.idle;
        if (!mask) continue;
        const bytes = atob(mask.alphaBase64),
          overlay = document.createElement('canvas');
        overlay.width = mask.width;
        overlay.height = mask.height;
        const image = new ImageData(mask.width, mask.height);
        for (let at = 0; at < bytes.length; at++) {
          image.data[at * 4] = 0;
          image.data[at * 4 + 1] = 255;
          image.data[at * 4 + 2] = 100;
          image.data[at * 4 + 3] = bytes.charCodeAt(at) >= threshold ? 110 : 0;
        }
        overlay.getContext('2d')?.putImageData(image, 0, 0);
        const g = layer.geometry,
          x = scene.geometry.anchor.x - g.anchor.x,
          y = scene.geometry.anchor.y - g.anchor.y;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        if (layer.flip) {
          ctx.translate(x + g.width, y);
          ctx.scale(-1, 1);
        } else ctx.translate(x, y);
        ctx.drawImage(overlay, 0, 0, g.width, g.height);
        ctx.restore();
      }
    });
    return () => {
      disposed = true;
    };
  }, [scene, threshold]);
  return (
    <canvas
      ref={canvas}
      aria-label="Hit-test mask overlay"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: scene.geometry.width,
        height: scene.geometry.height,
        pointerEvents: 'none',
      }}
    />
  );
}
