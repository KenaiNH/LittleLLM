import { useCallback, useEffect, useRef, useState } from 'react';
import type { Config, SpriteStateConfig } from '../../shared/config';
import { spriteStateSchema } from '../../shared/config';
import type { SpriteAssets, SpriteAsset } from '../../shared/sprites';
import type { SpriteTarget } from '../../shared/spriteImport';
import { mouthAsState } from '../../shared/spriteImport';
import { OPTIONS } from '../../shared/enums';
import type { Result } from '../../shared/api';
import { useSettingsStore } from './store';
import { matchesSearch, spriteSetting, SETTINGS, type Setting } from './definitions';
import { SettingRow } from './SettingRow';
import { SpritePreview } from './SpritePreview';
import upload from '../../../assets/figma/16-205-imgUpload.svg';
import toggleOn from '../../../assets/figma/2004-411-imgToggleOn.svg';
import toggleOff from '../../../assets/figma/16-205-imgToggleOff.svg';
import styles from './Settings.module.css';
const anchors: Record<string, { x: number; y: number }> = {
  'bottom-center': { x: 0.5, y: 1 },
  center: { x: 0.5, y: 0.5 },
  'top-center': { x: 0.5, y: 0 },
  'bottom-left': { x: 0, y: 1 },
  'bottom-right': { x: 1, y: 1 },
};
const anchorName = (point: { x: number; y: number }) =>
  Object.keys(anchors).find(
    (name) => anchors[name]?.x === point.x && anchors[name]?.y === point.y,
  ) ?? 'custom';
const clearStateDrafts = (state: SpriteTarget) =>
  useSettingsStore.setState((store) => ({
    invalid: Object.fromEntries(
      Object.entries(store.invalid).filter(([key]) => !key.startsWith(`sprite.${state}.`)),
    ),
    drafts: Object.fromEntries(
      Object.entries(store.drafts).filter(([key]) => !key.startsWith(`sprite.${state}.`)),
    ),
  }));
const title = (state: string) => state[0]?.toUpperCase() + state.slice(1);
const definitions = (state: string): Setting[] => [
  spriteSetting(state, 'frameWidth', {
    id: 26,
    label: 'Frame width',
    kind: 'number',
    min: 1,
    max: 8192,
    suffix: 'px',
  }),
  spriteSetting(state, 'frameHeight', {
    id: 27,
    label: 'Frame height',
    kind: 'number',
    min: 1,
    max: 8192,
    suffix: 'px',
  }),
  spriteSetting(state, 'frameCount', {
    id: 28,
    label: 'Frame count',
    kind: 'number',
    min: 1,
    max: 512,
  }),
  spriteSetting(state, 'columns', { id: 29, label: 'Columns', kind: 'number', min: 1, max: 512 }),
  spriteSetting(state, 'frameOrder', {
    id: 30,
    label: 'Frame order',
    kind: 'select',
    options: OPTIONS.frameOrder,
  }),
  spriteSetting(state, 'fps', {
    id: 31,
    label: 'Playback speed',
    kind: 'range',
    min: 1,
    max: 60,
    suffix: 'fps',
  }),
  spriteSetting(state, 'gifTimingSource', {
    id: 31,
    label: 'Timing source',
    kind: 'select',
    options: OPTIONS.gifTimingSource,
  }),
  spriteSetting(state, 'playbackMode', {
    id: 32,
    label: 'Playback mode',
    kind: 'select',
    options: OPTIONS.playbackMode,
  }),
  spriteSetting(state, 'anchor.x', {
    id: 34,
    label: 'Custom anchor X',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.01,
  }),
  spriteSetting(state, 'anchor.y', {
    id: 34,
    label: 'Custom anchor Y',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.01,
  }),
];
function DropZone({
  state,
  mode,
  source,
  onResult,
}: {
  state: SpriteTarget;
  mode: SpriteStateConfig['mode'];
  source?: string;
  onResult: (result: Result<Config>) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const receive = (result: Result<Config>) => {
    setError(result.ok ? null : result.error.userMessage);
    onResult(result);
  };
  const importFiles = async (files: File[]) => {
    if (busy || !files.length) return;
    setBusy(true);
    try {
      receive(await window.companion.importDroppedSprite(state, mode, files));
    } catch {
      setError('Drop real image files or use Browse to select a folder.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.row} data-control={state === 'mouth' ? 48 : 25}>
      <label className={styles.label}>File / folder</label>
      <div className={styles.control}>
        <div
          className={styles.dropZone}
          aria-label={`${title(state)} file drop zone`}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => {
            event.preventDefault();
            void importFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <img src={upload} alt="" />
          <span title={source}>
            {source === 'default.png'
              ? 'Bundled default'
              : (source?.split('/').at(-1) ?? 'Drop image files here')}
          </span>
          <button
            className={styles.button}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void window.companion
                .browseSprite(state, mode)
                .then(receive)
                .catch(() => setError('The sprite could not be imported.'))
                .finally(() => setBusy(false));
            }}
          >
            Browse…
          </button>
          <input
            type="file"
            tabIndex={-1}
            aria-label={`${title(state)} sprite files`}
            accept=".png,.apng,.gif,.webp"
            multiple={mode === 'frames'}
            hidden
            onChange={(event) => {
              void importFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </div>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
    </div>
  );
}
function StateSection({
  state,
  config,
  asset,
  query,
  receive,
}: {
  state: Exclude<SpriteTarget, 'mouth'>;
  config: Config;
  asset?: SpriteAsset;
  query: string;
  receive: (result: Result<Config>) => void;
}) {
  const spec = config.sprite[state] ?? spriteStateSchema.parse({}),
    [open, setOpen] = useState(state === 'idle'),
    [mode, setMode] = useState(spec.mode),
    [anchor, setAnchor] = useState(anchorName(spec.anchor));
  const [error, setError] = useState<string | null>(null);
  const matches = (label: string) => matchesSearch(title(state) + ' ' + label, query);
  useEffect(() => setMode(spec.mode), [spec.mode]);
  useEffect(() => setAnchor(anchorName(spec.anchor)), [spec.source]);
  useEffect(() => {
    if (anchor !== 'custom') setAnchor(anchorName(spec.anchor));
  }, [spec.anchor.x, spec.anchor.y]);
  const update = async (value: Record<string, unknown>) => {
    const error = await useSettingsStore.getState().patchState(state, value);
    setError(error);
    useSettingsStore.getState().markInvalid('sprite.' + state + '.mode', error);
  };
  const fields = definitions(state).filter(
    (d) =>
      matches(d.label) &&
      (d.id >= 26 && d.id <= 30
        ? mode === 'sheet'
        : d.key.endsWith('gifTimingSource')
          ? mode === 'static' && (asset?.frames.length ?? 1) > 1
          : d.id === 31 || d.id === 32
            ? mode !== 'static' || (asset?.frames.length ?? 1) > 1
            : anchor === 'custom'),
  );
  const present =
    !query ||
    fields.length ||
    [
      'Source type',
      'File / folder Browse',
      'Anchor point',
      'Preview',
      'Reset to Default Sprite',
    ].some((label) => matchesSearch(`${title(state)} ${label}`, query));
  if (!present) return null;
  return (
    <section className={styles.section} data-state-section={state}>
      <button
        className={styles.disclosure}
        aria-expanded={Boolean(open || query)}
        onClick={() => setOpen(!open)}
      >
        {open || query ? '⌄' : '›'} {title(state)}
      </button>
      {(open || query) && (
        <div className={styles.group}>
          {matches('Source type') && (
            <div className={styles.row} data-control="24">
              <label className={styles.label} htmlFor={`${state}-mode`}>
                Source type
              </label>
              <div className={styles.control} data-invalid={Boolean(error)}>
                <select
                  id={`${state}-mode`}
                  aria-label={`${title(state)} source type`}
                  value={mode}
                  onChange={(event) => {
                    const next = event.target.value as SpriteStateConfig['mode'];
                    setMode(next);
                    void update({ mode: next });
                  }}
                >
                  {OPTIONS.spriteMode.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}
          {matches('File folder Browse') && (
            <DropZone
              state={state}
              mode={mode}
              source={spec.source}
              onResult={(result) => {
                if (result.ok && result.value.sprite[state]?.source !== spec.source)
                  clearStateDrafts(state);
                receive(result);
                if (result.ok) {
                  setError(null);
                  useSettingsStore.getState().markInvalid('sprite.' + state + '.mode', null);
                }
              }}
            />
          )}
          {mode === 'frames' && asset && (
            <div className={styles.row}>{asset.frames.length} frames detected</div>
          )}
          {fields
            .filter((d) => d.id !== 34)
            .map((d) => (
              <SettingRow
                key={d.key + spec.source}
                definition={d}
                config={config}
                fallbackValue={
                  d.id === 26
                    ? asset?.width
                    : d.id === 27
                      ? asset?.height
                      : d.id === 28
                        ? asset?.frames.length
                        : d.id === 29
                          ? 1
                          : undefined
                }
              />
            ))}
          {matches('Anchor point') && (
            <div className={styles.row} data-control="33">
              <label className={styles.label} htmlFor={`${state}-anchor`}>
                Anchor point
              </label>
              <div className={styles.control}>
                <select
                  id={`${state}-anchor`}
                  aria-label={`${title(state)} anchor point`}
                  value={anchor}
                  onChange={(event) => {
                    const next = event.target.value;
                    setAnchor(next);
                    if (anchors[next]) void update({ anchor: anchors[next] });
                  }}
                >
                  {OPTIONS.anchor.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {fields
            .filter((d) => d.id === 34)
            .map((d) => (
              <SettingRow key={d.key} definition={d} config={config} />
            ))}
          {matches('Preview scrubber animation') && asset && (
            <div className={styles.row} data-control="35">
              <span className={styles.label}>Preview</span>
              <div className={styles.control}>
                <SpritePreview asset={asset} spec={spec} config={config} name={title(state)} />
              </div>
            </div>
          )}
          {matches('Reset to Default Sprite') && (
            <div className={styles.row} data-control="36">
              <button
                className={styles.button}
                onClick={() =>
                  void window.companion.resetSprite(state).then((result) => {
                    if (result.ok) clearStateDrafts(state);
                    receive(result);
                    if (result.ok) {
                      setError(null);
                      setAnchor('bottom-center');
                      useSettingsStore.getState().markInvalid('sprite.' + state + '.mode', null);
                    }
                  })
                }
              >
                Reset to Default Sprite
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
const mouthDefinitions: Setting[] = [
  spriteSetting('mouth', 'driver', {
    id: 46,
    label: 'Driven by',
    kind: 'select',
    options: OPTIONS.mouthDriver,
    hint: 'With voice output off, Audio amplitude falls back to Text streaming rate.',
  }),
  spriteSetting('mouth', 'mode', {
    id: 47,
    label: 'Source type',
    kind: 'select',
    options: OPTIONS.mouthMode,
  }),
  spriteSetting('mouth', 'frameCount', {
    id: 49,
    label: 'Frame count',
    kind: 'number',
    min: 2,
    max: 8,
  }),
  spriteSetting('mouth', 'offset.x', {
    id: 51,
    label: 'Offset X',
    kind: 'number',
    min: -512,
    max: 512,
    suffix: 'px',
  }),
  spriteSetting('mouth', 'offset.y', {
    id: 52,
    label: 'Offset Y',
    kind: 'number',
    min: -512,
    max: 512,
    suffix: 'px',
  }),
  spriteSetting('mouth', 'sensitivity', {
    id: 53,
    label: 'Sensitivity',
    kind: 'range',
    min: 0.1,
    max: 5,
    step: 0.1,
  }),
  spriteSetting('mouth', 'smoothing', {
    id: 54,
    label: 'Smoothing',
    kind: 'range',
    min: 0,
    max: 0.95,
    step: 0.05,
  }),
  spriteSetting('mouth', 'silenceThreshold', {
    id: 55,
    label: 'Silence threshold',
    kind: 'range',
    min: 0,
    max: 0.5,
    step: 0.01,
  }),
];
function MouthSection({
  config,
  asset,
  query,
  receive,
}: {
  config: Config;
  asset?: SpriteAsset;
  query: string;
  receive: (result: Result<Config>) => void;
}) {
  const mouth = config.sprite.mouth,
    [testing, setTesting] = useState(false),
    [mode, setMode] = useState(mouth.mode),
    [testError, setTestError] = useState<string | null>(null),
    audio = useRef<AudioContext | null>(null),
    analyser = useRef<AnalyserNode | null>(null),
    smoothing = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setMode(mouth.mode), [mouth.mode]);
  const sample = useRef(new Float32Array(256));
  const stop = useCallback(() => {
    clearTimeout(timer.current);
    void audio.current?.close();
    audio.current = null;
    analyser.current = null;
    setTesting(false);
  }, []);
  useEffect(() => {
    if (!mouth.enabled && testing) stop();
  }, [mouth.enabled, testing, stop]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      void audio.current?.close();
    },
    [],
  );
  const driver = useCallback(() => {
    if (!testing || !asset) return null;
    if (mouth.driver === 'fixed-loop')
      return Math.floor((audio.current?.currentTime ?? 0) * 12) % asset.frames.length;
    if (mouth.driver === 'text-rate')
      return Math.floor((audio.current?.currentTime ?? 0) * 8) % asset.frames.length;
    analyser.current?.getFloatTimeDomainData(sample.current);
    const rms = Math.min(
      1,
      Math.sqrt(
        sample.current.reduce((sum, value) => sum + value * value, 0) / sample.current.length,
      ) * Math.SQRT2,
    );
    smoothing.current = mouth.smoothing * smoothing.current + (1 - mouth.smoothing) * rms;
    return Math.max(
      0,
      Math.min(
        asset.frames.length - 1,
        Math.floor(
          (smoothing.current < mouth.silenceThreshold ? 0 : smoothing.current * mouth.sensitivity) *
            asset.frames.length,
        ),
      ),
    );
  }, [testing, asset, mouth.driver, mouth.smoothing, mouth.silenceThreshold, mouth.sensitivity]);
  const test = async () => {
    setTestError(null);
    if (testing) {
      stop();
      return;
    }
    const context = new AudioContext();
    audio.current = context;
    await context.resume();
    const oscillator = context.createOscillator(),
      gain = context.createGain(),
      output = context.createGain(),
      meter = context.createAnalyser();
    meter.fftSize = 256;
    analyser.current = meter;
    oscillator.frequency.value = 220;
    oscillator.connect(gain);
    gain.connect(meter);
    meter.connect(output);
    output.gain.value = 0.12;
    output.connect(context.destination);
    const start = context.currentTime;
    gain.gain.setValueAtTime(0, start);
    for (let index = 0; index < 12; index++) {
      gain.gain.linearRampToValueAtTime(index % 2 ? 0.04 : 0.95, start + (index + 1) * 0.25);
    }
    oscillator.start();
    oscillator.stop(start + 3);
    setTesting(true);
    timer.current = setTimeout(stop, 3100);
  };
  const fields = mouthDefinitions.filter(
    (d) =>
      matchesSearch(d.label, query) &&
      (!(d.id >= 53 && d.id <= 55) || mouth.driver !== 'fixed-loop'),
  );
  if (
    query &&
    !matchesSearch('Enable mouth frames mouth lip sync', query) &&
    !fields.length &&
    !matchesSearch('Test Mouth Sync quietest loudest file folder', query)
  )
    return null;
  return (
    <section className={styles.section}>
      <h2>Mouth Frames (Lip Sync)</h2>
      <div className={styles.group}>
        <div className={styles.row}>
          <span className={styles.hint}>
            Mouth animation and lip syncing are planned for a future release. These controls prepare
            assets only.
          </span>
        </div>
        {matchesSearch('Enable mouth frames', query) && (
          <div className={styles.row} data-control="45">
            <span className={styles.label}>Enable mouth frames</span>
            <div className={styles.control}>
              <button
                role="switch"
                aria-label="Enable mouth frames"
                aria-checked={mouth.enabled}
                className={styles.switch}
                onClick={() =>
                  void useSettingsStore.getState().patchState('mouth', { enabled: !mouth.enabled })
                }
              >
                <img src={mouth.enabled ? toggleOn : toggleOff} alt="" />
              </button>
            </div>
          </div>
        )}
        {mouth.enabled && (
          <>
            {fields
              .filter((d) => d.id === 46)
              .map((d) => (
                <SettingRow key={d.key} definition={d} config={config} />
              ))}
            {matchesSearch('Source type', query) && (
              <div className={styles.row}>
                <label className={styles.label} htmlFor="mouth-mode">
                  Source type
                </label>
                <div className={styles.control}>
                  <select
                    id="mouth-mode"
                    aria-label="Mouth source type"
                    value={mode}
                    onChange={(event) => {
                      const next = event.target.value as typeof mode;
                      setMode(next);
                      void useSettingsStore
                        .getState()
                        .patchState('mouth', { mode: next })
                        .then((error) => {
                          setTestError(error);
                          useSettingsStore.getState().markInvalid('sprite.mouth.mode', error);
                        });
                    }}
                  >
                    {OPTIONS.mouthMode.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {matchesSearch('File folder Browse', query) && (
              <DropZone
                state="mouth"
                mode={mode}
                source={mouth.source}
                onResult={(result) => {
                  receive(result);
                  if (result.ok) {
                    setTestError(null);
                    useSettingsStore.getState().markInvalid('sprite.mouth.mode', null);
                  }
                }}
              />
            )}
            {fields
              .filter((d) => d.id > 47)
              .map((d) => (
                <SettingRow key={d.key} definition={d} config={config} />
              ))}
            {matchesSearch('Frame order quietest loudest', query) && (
              <div className={styles.row} data-control="50">
                <span className={styles.label}>Frame order</span>
                <span>Quietest → loudest</span>
              </div>
            )}
            {asset && (
              <div className={styles.row}>
                <span className={styles.label}>Preview</span>
                <div className={styles.control}>
                  <SpritePreview
                    asset={asset}
                    config={config}
                    spec={mouthAsState(mouth)}
                    name="Mouth"
                    driver={testing ? driver : undefined}
                  />
                </div>
              </div>
            )}
            {matchesSearch('Test Mouth Sync', query) && (
              <div className={styles.row} data-control="56">
                <button
                  className={styles.button}
                  disabled={!asset}
                  title="Plays a three-second test tone"
                  onClick={() =>
                    void test().catch(() => {
                      stop();
                      setTestError(
                        'The test tone could not be played. Check your audio output device.',
                      );
                    })
                  }
                >
                  {testing ? 'Stop Test' : 'Test Mouth Sync'}
                </button>
              </div>
            )}
            {testError && (
              <p role="alert" className={styles.error}>
                {testError}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
export function SpritesPanel({ config, query }: { config: Config; query: string }) {
  const [assets, setAssets] = useState<SpriteAssets | null>(null),
    [error, setError] = useState<string | null>(null),
    [epoch, setEpoch] = useState(0);
  const key = JSON.stringify(config.sprite);
  useEffect(() => {
    let active = true;
    void window.companion.getSpriteAssets().then((result) => {
      if (!active) return;
      if (result.ok) {
        setAssets(result.value);
        setError(null);
      } else setError(result.error.userMessage);
    });
    return () => {
      active = false;
    };
  }, [key, epoch]);
  const receive = (result: Result<Config>) => {
    if (result.ok) {
      useSettingsStore.getState().receive(result.value);
      setEpoch((value) => value + 1);
      setError(null);
    } else setError(result.error.userMessage);
  };
  const globals = SETTINGS.filter(
    (d) =>
      d.panel === 'Sprites' && (!d.visible || d.visible(config)) && matchesSearch(d.label, query),
  );
  return (
    <>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {(['idle', 'thinking', 'speaking'] as const).map((state) => (
        <StateSection
          key={state}
          state={state}
          config={config}
          asset={assets?.[state]}
          query={query}
          receive={receive}
        />
      ))}
      {config.sprite.listeningBehavior === 'custom' && (
        <StateSection
          state="listening"
          config={config}
          asset={assets?.listening}
          query={query}
          receive={receive}
        />
      )}
      {globals.length > 0 && (
        <section className={styles.section}>
          <h2>Global Sprite Settings</h2>
          <div className={styles.group}>
            {globals.map((d) => (
              <SettingRow key={d.key} definition={d} config={config} />
            ))}
          </div>
        </section>
      )}
      <MouthSection config={config} asset={assets?.mouth} query={query} receive={receive} />
      {matchesSearch('Import Sprite Pack Export Sprite Pack Open Sprites Folder', query) && (
        <section className={styles.section}>
          <h2>Sprite Packs</h2>
          <div className={styles.group}>
            <div className={styles.row}>
              {matchesSearch('Import Sprite Pack', query) && (
                <button
                  className={styles.button}
                  data-control="57"
                  onClick={() => void window.companion.importSpritePack().then(receive)}
                >
                  Import Sprite Pack
                </button>
              )}
              {matchesSearch('Export Sprite Pack', query) && (
                <button
                  className={styles.button}
                  data-control="58"
                  onClick={() =>
                    void window.companion.exportSpritePack().then((result) => {
                      if (!result.ok) setError(result.error.userMessage);
                    })
                  }
                >
                  Export Sprite Pack
                </button>
              )}
              {matchesSearch('Open Sprites Folder', query) && (
                <button
                  className={styles.button}
                  data-control="59"
                  onClick={() => void window.companion.openSpritesFolder()}
                >
                  Open Sprites Folder
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
