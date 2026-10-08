import { useCallback, useEffect, useState } from 'react';
import { usePetStore } from './store';
import { Sprite } from './Sprite';
import { useSpriteInteraction } from './useSpriteInteraction';
import type { ChatUi } from '../../shared/chatUi';
import { Bubble } from './Bubble';
import type { PetViewport } from '../../shared/petLayout';
import styles from './App.module.css';
export function PetApp() {
  const { config, assets, state, error, initialize, setState } = usePetStore();
  const [ui, setUi] = useState<ChatUi | null>(null),
    [viewport, setViewport] = useState<PetViewport | null>(null),
    [bubbleSize, setBubbleSize] = useState<{ width: number; height: number } | null>(null);
  useSpriteInteraction(config, state);
  useEffect(() => {
    void initialize();
    return window.companion.onConfig(() => {
      void initialize();
    });
  }, [initialize]);
  useEffect(() => {
    let active = true;
    void window.companion.getChatUi().then((result) => {
      if (active && result.ok) setUi(result.value);
    });
    const remove = window.companion.onChatUi(setUi);
    return () => {
      active = false;
      remove();
    };
  }, []);
  useEffect(() => {
    let active = true;
    void window.companion.getPetViewport().then((result) => {
      if (active && result.ok) setViewport(result.value);
    });
    const remove = window.companion.onPetViewport(setViewport);
    return () => {
      active = false;
      remove();
    };
  }, []);
  const measure = useCallback(
    (size: { width: number; height: number }) =>
      setBubbleSize((old) =>
        old && Math.abs(old.width - size.width) < 0.1 && Math.abs(old.height - size.height) < 0.1
          ? old
          : size,
      ),
    [],
  );
  const selected =
      state === 'listening'
        ? config?.sprite.listeningBehavior === 'use-thinking'
          ? 'thinking'
          : config?.sprite.listeningBehavior === 'custom'
            ? 'listening'
            : 'idle'
        : state,
    asset = assets?.[selected] ?? assets?.idle,
    scale = config
      ? config.sprite.scale / (config.sprite.scaleMode === 'fixed' ? (viewport?.dpi ?? 1) : 1)
      : 1;
  useEffect(() => {
    if (!asset || !config || !viewport) return;
    let active = true;
    void window.companion
      .layoutPet(
        { width: asset.width * scale, height: asset.height * scale },
        ui?.echo ? bubbleSize : null,
      )
      .then((result) => {
        if (active && result.ok) setViewport(result.value);
      });
    return () => {
      active = false;
    };
  }, [
    asset,
    config,
    scale,
    bubbleSize,
    ui?.echo,
    viewport?.workArea.width,
    viewport?.workArea.height,
  ]);
  const completed = useCallback(() => setState('idle'), [setState]);
  return (
    <div
      className={styles.pet}
      data-testid="pet"
      style={{ width: viewport?.window.width ?? 128, height: viewport?.window.height ?? 128 }}
    >
      {error && <span role="alert">{error}</span>}
      {ui?.echo && config && viewport && (
        <div
          className={styles.layer}
          style={{ left: viewport.bubble?.x ?? 0, top: viewport.bubble?.y ?? 0 }}
        >
          <Bubble
            {...ui.echo}
            config={config}
            viewport={viewport}
            onMeasure={measure}
            onRegenerate={() => void window.companion.submitInput(ui.echo?.text ?? '')}
          />
        </div>
      )}
      {config && assets && viewport && (
        <div className={styles.layer} style={{ left: viewport.sprite.x, top: viewport.sprite.y }}>
          <Sprite
            assets={assets}
            config={config.sprite}
            state={state}
            onComplete={completed}
            fpsCap={config.advanced.fpsCap === 'display' ? 240 : Number(config.advanced.fpsCap)}
          />
        </div>
      )}
    </div>
  );
}
