import { useCallback, useEffect, useState } from 'react';
import { usePetStore } from './store';
import { Sprite } from './Sprite';
import { useSpriteInteraction } from './useSpriteInteraction';
import type { ChatUi } from '../../shared/chatUi';
import { Bubble } from './Bubble';
import type { PetViewport } from '../../shared/petLayout';
import styles from './App.module.css';
import { useSpriteScene } from './useSpriteScene';
import { useSpeech } from './useSpeech';
import { useMicrophone } from './useMicrophone';
import mic from '../../../assets/figma/2016-81-imgMic.svg';
export function PetApp() {
  const { config, assets, state, error, initialize, setState } = usePetStore();
  useSpeech(config);
  useMicrophone(config);
  const [ui, setUi] = useState<ChatUi | null>(null),
    [viewport, setViewport] = useState<PetViewport | null>(null),
    [bubbleSize, setBubbleSize] = useState<{ width: number; height: number } | null>(null);
  const { scene, finish } = useSpriteScene(
    assets,
    config?.sprite,
    state,
    viewport?.dpi ?? window.devicePixelRatio,
  );
  useSpriteInteraction(config, scene);
  useEffect(() => {
    let active = true;
    void window.companion.getState().then((result) => {
      if (active && result.ok) setState(result.value.state);
    });
    const remove = window.companion.onState((value) => setState(value.state));
    return () => {
      active = false;
      remove();
    };
  }, [setState]);
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
  useEffect(() => {
    if (!scene || !config || !viewport) return;
    let active = true;
    void window.companion
      .layoutPet(
        {
          width: Math.max(ui?.stt.microphoneOpen ? 32 : 0, scene.geometry.width),
          height: Math.max(ui?.stt.microphoneOpen ? 32 : 0, scene.geometry.height),
        },
        ui?.reply ? bubbleSize : null,
        scene.geometry.anchor,
      )
      .then((result) => {
        if (active && result.ok) setViewport(result.value);
      });
    return () => {
      active = false;
    };
  }, [
    scene,
    config,
    bubbleSize,
    Boolean(ui?.reply),
    ui?.stt.microphoneOpen,
    viewport?.workArea.width,
    viewport?.workArea.height,
  ]);
  return (
    <div
      className={styles.pet}
      data-testid="pet"
      style={{ width: viewport?.window.width ?? 128, height: viewport?.window.height ?? 128 }}
    >
      {error && <span role="alert">{error}</span>}
      {ui?.reply && config && viewport && (
        <div
          className={styles.layer}
          style={{ left: viewport.bubble?.x ?? 0, top: viewport.bubble?.y ?? 0 }}
        >
          <Bubble
            {...ui.reply}
            config={config}
            viewport={viewport}
            onMeasure={measure}
            error={ui.error?.userMessage}
            speaking={ui.speaking}
            speechNotice={ui.speechNotice}
            queuedMessage={ui.queuedMessage}
            onStop={() => void window.companion.abortChat(ui.reply?.requestId)}
            onRegenerate={() => void window.companion.regenerateChat()}
          />
        </div>
      )}
      {config && assets && viewport && scene && (
        <div className={styles.layer} style={{ left: viewport.sprite.x, top: viewport.sprite.y }}>
          <Sprite
            assets={assets}
            scene={scene}
            state={state}
            onFadeEnd={finish}
            fpsCap={config.advanced.fpsCap === 'display' ? 240 : Number(config.advanced.fpsCap)}
          />
          {ui?.stt.microphoneOpen && (
            <button
              data-interactive
              className={styles.microphone}
              aria-label="Microphone active — cancel recording"
              title="Microphone active — click to cancel"
              onClick={() => void window.companion.abortStt()}
            >
              <img src={mic} alt="" />
            </button>
          )}
        </div>
      )}
      {import.meta.env.DEV && (
        <select
          aria-label="Preview sprite state"
          data-interactive
          style={{ position: 'absolute', top: 0, left: 0 }}
          defaultValue="auto"
          onChange={(event) =>
            void window.companion.overrideState(event.target.value as typeof state | 'auto')
          }
        >
          {['auto', 'idle', 'thinking', 'speaking', 'listening'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      )}
    </div>
  );
}
