import { useEffect } from 'react';
import type { Config } from '../../shared/config';
import type { SpriteState } from '../../shared/enums';
import { alphaHit, sourcePixel, type AlphaMask } from '../../shared/hitTest';
import type { SpriteScene } from './useSpriteScene';
export function useSpriteInteraction(config: Config | null, scene: SpriteScene | null) {
  useEffect(() => {
    if (!config) return;
    const controller = new AbortController();
    const masks: Partial<Record<SpriteState, AlphaMask>> = {};
    void window.companion.getSpriteMasks().then((result) => {
      if (controller.signal.aborted || !result.ok) return;
      for (const [key, mask] of Object.entries(result.value)) {
        if (!mask) continue;
        const data = atob(mask.alphaBase64);
        masks[key as SpriteState] = {
          width: mask.width,
          height: mask.height,
          alpha: Uint8Array.from(data, (c) => c.charCodeAt(0)),
        };
      }
    });
    let frame = 0,
      ignore = false,
      last = false,
      drag: null | { screenX: number; screenY: number; x: number; y: number } = null,
      moved = false,
      suppressClick = false;
    const move = (event: MouseEvent) => {
      if (drag) {
        if (Math.hypot(event.screenX - drag.screenX, event.screenY - drag.screenY) > 4)
          moved = true;
        if (moved)
          window.companion.movePet(
            drag.x + event.screenX - drag.screenX,
            drag.y + event.screenY - drag.screenY,
          );
        return;
      }
      const canvas = document.querySelector('canvas[data-testid="sprite"]');
      const bounds = canvas?.getBoundingClientRect();
      if (!bounds) return;
      const interactive =
        event.target instanceof Element
          ? event.target.closest('button,input,textarea,select,[data-interactive]')
          : null;
      const inside =
        event.clientX >= bounds.x &&
        event.clientX < bounds.right &&
        event.clientY >= bounds.y &&
        event.clientY < bounds.bottom;
      const hit =
        config.advanced.clickThrough === 'never' ||
        Boolean(interactive) ||
        (inside &&
          (config.advanced.clickThrough === 'bounding-box' ||
            !scene ||
            scene.layers.some((layer) => {
              const mask = masks[layer.selected] ?? masks.idle;
              if (!mask) return true;
              return alphaHit(
                mask,
                sourcePixel({
                  cursorDip: { x: event.screenX, y: event.screenY },
                  windowDip: { x: window.screenX, y: window.screenY },
                  canvasCss: {
                    x: bounds.x + scene.geometry.anchor.x - layer.geometry.anchor.x,
                    y: bounds.y + scene.geometry.anchor.y - layer.geometry.anchor.y,
                  },
                  scale: layer.geometry.width / mask.width,
                  dpi: window.devicePixelRatio,
                  scaleMode: 'dpi-aware',
                  flip: layer.flip,
                  width: mask.width,
                  height: mask.height,
                }),
                config.advanced.alphaThreshold,
              );
            })));
      ignore = !hit;
      if (!frame) {
        let samples = 0;
        const apply = () => {
          if (++samples < config.advanced.hitTestEveryNFrames) {
            frame = requestAnimationFrame(apply);
            return;
          }
          frame = 0;
          if (last !== ignore) {
            last = ignore;
            window.companion.setIgnoreMouse(ignore);
          }
        };
        frame = requestAnimationFrame(apply);
      }
    };
    const down = (event: MouseEvent) => {
      const modifier = config.advanced.dragModifier;
      if (
        event.button !== 0 ||
        !config.advanced.dragEnabled ||
        (modifier === 'alt' && !event.altKey) ||
        (modifier === 'ctrl' && !event.ctrlKey) ||
        (modifier === 'shift' && !event.shiftKey) ||
        !(event.target instanceof HTMLCanvasElement)
      )
        return;
      drag = {
        screenX: event.screenX,
        screenY: event.screenY,
        x: window.screenX,
        y: window.screenY,
      };
      moved = false;
      window.companion.setIgnoreMouse(false);
    };
    const up = (event: MouseEvent) => {
      drag = null;
      suppressClick = moved;
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
      }
      moved = false;
    };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) return;
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (config.input.openOn === 'single-click' && event.detail === 1)
        void window.companion.toggleInput();
    };
    const double = (event: MouseEvent) => {
      if (event.target instanceof HTMLCanvasElement && config.input.openOn === 'double-click')
        void window.companion.toggleInput();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        void window.companion.abortChat().then(() => window.companion.closeInput());
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mousedown', down);
    document.addEventListener('mouseup', up, true);
    document.addEventListener('click', click, true);
    document.addEventListener('dblclick', double);
    document.addEventListener('keydown', key);
    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mousedown', down);
      document.removeEventListener('mouseup', up, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('dblclick', double);
      document.removeEventListener('keydown', key);
      window.companion.setIgnoreMouse(false);
    };
  }, [config, scene]);
}
