import { useState } from 'react';
import type { Config } from '../../shared/config';
import type { DiagnosticAction, SessionPatch } from '../../shared/diagnostics';
import { OPTIONS } from '../../shared/enums';
import { useRuntime } from '../useRuntime';
import { SettingRow } from './SettingRow';
import { SETTINGS, matchesSearch, type Setting } from './definitions';
import { useSettingsStore, flushSettings } from './store';
import { flushSecrets } from './SecretInput';
import styles from './Settings.module.css';
const actions = [
  [172, 'Open Logs Folder', 'open-logs'],
  [173, 'Open Config Folder', 'open-config'],
  [174, 'Export Settings…', 'export-settings'],
  [175, 'Import Settings…', 'import-settings'],
  [176, 'Reset All Settings', 'reset-all'],
  [177, 'Clear Stored API Keys', 'clear-keys'],
] as const;
export const ADVANCED_SEARCH_LABELS = [
  ...actions.map(([, label]) => label),
  'Clear Audio Cache',
  'Open DevTools Sprite Window Settings Window',
  'Show hit-test mask overlay',
  'Show FPS and frame time',
  'Force state',
  'About app version Electron Chromium Node schemaVersion config file path license',
];
export function AdvancedPanel({ config, query }: { config: Config; query: string }) {
  const runtime = useRuntime();
  const environment = useSettingsStore((state) => state.environment);
  const [confirmation, setConfirmation] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const action = async (request: DiagnosticAction) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await Promise.all([flushSettings(), flushSecrets()]);
      if (Object.keys(useSettingsStore.getState().invalid).length) {
        setError('Fix invalid settings before continuing.');
        return;
      }
      const result = await window.companion.diagnostics(request);
      if (result.ok) {
        useSettingsStore.getState().receive(result.value);
        if (request.action === 'import-settings' || request.action === 'reset-all')
          useSettingsStore.setState({ drafts: {}, invalid: {} });
        setConfirmation('');
        // Clear-key actions also refresh the mounted secret fields when visited.
      } else setError(result.error.userMessage);
    } catch {
      setError('The action could not be completed.');
    } finally {
      setBusy(false);
    }
  };
  const matching = (label: string) => matchesSearch(label, query);
  const rows = SETTINGS.filter(
    (d) => d.panel === 'Advanced' && (!d.visible || d.visible(config)) && matching(d.label),
  );
  const session = (
    id: number,
    key: keyof SessionPatch,
    label: string,
    kind: 'toggle' | 'select',
  ): Setting => ({
    id,
    panel: 'Advanced',
    section: 'advanced',
    group: 'Developer',
    key,
    label,
    kind,
    ...(kind === 'select' ? { options: OPTIONS.forceState } : {}),
  });
  const developerRows = [
    session(181, 'showMaskOverlay', 'Show hit-test mask overlay', 'toggle'),
    session(182, 'showFps', 'Show FPS and frame time', 'toggle'),
    session(183, 'forceState', 'Force state', 'select'),
  ];
  return (
    <>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {runtime?.warnings.map((value) => (
        <p key={value} role="status" className={styles.warning}>
          {value}
        </p>
      ))}
      {['Interaction', 'Performance', 'Network', 'Data & Diagnostics', 'Developer', 'About'].map(
        (group) => {
          const fields = rows.filter((d) => d.group === group);
          const diagnostics =
            group === 'Data & Diagnostics' && actions.filter(([, label]) => matching(label));
          const developer = group === 'Developer' && config.advanced.developerMode;
          const about = group === 'About' && matching(ADVANCED_SEARCH_LABELS.at(-1) ?? 'About');
          const cache =
            group === 'Data & Diagnostics' &&
            config.tts.provider !== 'none' &&
            config.tts.cacheAudio &&
            matching('Clear Audio Cache');
          if (
            !fields.length &&
            !(diagnostics && diagnostics.length) &&
            !cache &&
            !(
              developer &&
              matching(
                'Open DevTools Show hit-test mask overlay Show FPS and frame time Force state',
              )
            ) &&
            !about
          )
            return null;
          return (
            <section key={group} className={styles.section}>
              <h2>{group}</h2>
              <div className={styles.group}>
                {fields.map((d) => (
                  <SettingRow key={d.key} definition={d} config={config} />
                ))}
                {group === 'Network' && config.advanced.allowSelfSigned && (
                  <p role="status" className={styles.error}>
                    ⚠ Only enable this for local endpoints you control. Certificate trust applies
                    only to configured provider hosts.
                  </p>
                )}
                {diagnostics &&
                  diagnostics.map(([id, label, name]) => (
                    <div key={id} className={styles.row} data-control={id}>
                      {name === 'reset-all' && (
                        <div className={styles.control}>
                          <input
                            aria-label="Type RESET to confirm"
                            placeholder="Type RESET to confirm"
                            value={confirmation}
                            onChange={(event) => setConfirmation(event.target.value)}
                          />
                        </div>
                      )}
                      <button
                        className={`${styles.button} ${['reset-all', 'clear-keys'].includes(name) ? styles.destructive : ''}`}
                        disabled={busy || (name === 'reset-all' && confirmation !== 'RESET')}
                        onClick={() =>
                          void action({
                            action: name,
                            ...(name === 'reset-all' ? { confirmation } : {}),
                          })
                        }
                      >
                        {label}
                      </button>
                    </div>
                  ))}
                {cache && (
                  <div className={styles.row} data-control="235">
                    <button
                      className={styles.button}
                      disabled={busy}
                      onClick={() => void action({ action: 'clear-audio-cache' })}
                    >
                      Clear Audio Cache (
                      {((runtime?.audioCacheBytes ?? 0) / 1024 / 1024).toFixed(1)} MB)
                    </button>
                  </div>
                )}
                {developer && (
                  <>
                    {(
                      [
                        [179, 'Open DevTools (Sprite Window)', 'devtools-pet'],
                        [180, 'Open DevTools (Settings Window)', 'devtools-settings'],
                      ] as const
                    )
                      .filter(([, label]) => matching(label))
                      .map(([id, label, name]) => (
                        <div key={id} className={styles.row} data-control={id}>
                          <button
                            className={styles.button}
                            disabled={busy}
                            onClick={() => void action({ action: name })}
                          >
                            {label}
                          </button>
                        </div>
                      ))}
                    {runtime &&
                      developerRows
                        .filter((d) => matching(d.label))
                        .map((d) => (
                          <SettingRow
                            key={d.key}
                            definition={d}
                            config={config}
                            fallbackValue={runtime.session[d.key as keyof SessionPatch]}
                            onSave={async (value) => {
                              const result = await window.companion.setSession({ [d.key]: value });
                              return result.ok ? null : result.error.userMessage;
                            }}
                          />
                        ))}
                  </>
                )}
                {about && (
                  <div className={styles.row}>
                    <dl className={styles.about}>
                      {Object.entries({
                        'App version': environment?.version ?? '—',
                        Electron: environment?.electron ?? '—',
                        Chromium: environment?.chromium ?? '—',
                        Node: environment?.node ?? '—',
                        schemaVersion: config.schemaVersion,
                        'Config file': environment?.configPath ?? '—',
                        License: 'GNU GPL v3 (see LICENSE in the installation folder)',
                      }).map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            </section>
          );
        },
      )}
    </>
  );
}
