import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ModelInfo } from '../../shared/llm';
import type { ImageCapability } from '../../shared/attachments';
import type { SecretStatus, SecretId } from '../../shared/settings';
import { useSettingsStore, flushSettings } from './store';
import { PANELS, SETTINGS, SPRITE_SEARCH_LABELS, matchesSearch, type Panel } from './definitions';
import { SettingRow } from './SettingRow';
import { SecretInput, flushSecrets } from './SecretInput';
import { Hotkeys, hotkeyMatches, HOTKEY_ACTIONS } from './Hotkeys';
import { AppearancePreview } from './AppearancePreview';
import { SpritesPanel } from './SpritesPanel';
import { VoicePanel } from './VoicePanel';
import { VoiceInputPanel } from './VoiceInputPanel';
import { PersonaPanel, PERSONA_SEARCH_LABELS } from './PersonaPanel';
import { VOICE_INPUT_ENABLED } from '../../shared/featureScope';
import searchIcon from '../../../assets/figma/2004-411-imgSearch.svg';
import chevron from '../../../assets/figma/16-205-imgChevronDown.svg';
import toggleOn from '../../../assets/figma/2004-411-imgToggleOn.svg';
import toggleOff from '../../../assets/figma/16-205-imgToggleOff.svg';
import styles from './Settings.module.css';
const implemented = new Set<Panel>([
  'General',
  'Sprites',
  'Model',
  'Voice',
  'Voice Input',
  'Appearance',
  'Persona',
]);
const extras: Partial<Record<Panel, string[]>> = {
  Persona: PERSONA_SEARCH_LABELS,
  Voice: ['API key authentication password', 'Test Voice', 'Test Connection'],
  'Voice Input': [
    'API key password permission Input level Test Microphone Test Connection Privacy',
    'Re-insert last transcript',
  ],
  Sprites: SPRITE_SEARCH_LABELS,
  General: [
    'Hotkeys shortcut keyboard',
    ...HOTKEY_ACTIONS.filter(
      ([key]) => VOICE_INPUT_ENABLED || !['voice', 'voiceSend', 'muteMic'].includes(key),
    ).map(([, label]) => label + ' shortcut keyboard'),
    'Stop speaking / cancel generation',
  ],
  Model: [
    'API key authentication password',
    'Test Connection',
    'Clear Conversation History',
    'Refresh models',
  ],
};
export function SettingsApp({ initialPanel }: { initialPanel: Panel }) {
  const { config, environment, initialize, receive, invalid, error } = useSettingsStore();
  const [panel, setPanel] = useState<Panel>(
      implemented.has(initialPanel) ? initialPanel : 'General',
    ),
    [query, setQuery] = useState(''),
    [models, setModels] = useState<ModelInfo[]>([]),
    [imageSupport, setImageSupport] = useState<ImageCapability | null>(null),
    [status, setStatus] = useState('Idle'),
    [verifiedSignature, setVerified] = useState(''),
    [credentials, setCredentials] = useState<Partial<Record<SecretId, SecretStatus>>>({}),
    [resetEpoch, setResetEpoch] = useState(0),
    [restartLater, setRestartLater] = useState(false);
  const search = useRef<HTMLInputElement>(null),
    boot = useRef<typeof config>(null),
    testing = useRef(false);
  if (config && !boot.current) boot.current = config;
  useEffect(() => {
    void initialize();
    const removeConfig = window.companion.onConfig(receive),
      removePanel = window.companion.onSettingsPanel((next) => {
        if (implemented.has(next)) {
          setQuery('');
          setPanel(next);
        }
      }),
      removeEnvironment = window.companion.onSettingsEnvironment((value) =>
        useSettingsStore.setState({ environment: value }),
      );
    return () => {
      removeConfig();
      removePanel();
      removeEnvironment();
    };
  }, [initialize, receive]);
  useEffect(() => setRestartLater(false), [config?.window.contentProtection]);
  const navigation = PANELS.filter(
    (name) =>
      !query ||
      SETTINGS.some(
        (d) => d.panel === name && matchesSearch(`${d.label} ${d.synonyms ?? ''}`, query),
      ) ||
      extras[name]?.some((label) => matchesSearch(label, query)),
  );
  useEffect(() => {
    if (navigation.length && !navigation.includes(panel)) {
      const next = navigation.find((name) => implemented.has(name));
      if (next) setPanel(next);
    }
  }, [query, panel]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        search.current?.focus();
      }
      const next = PANELS[Number(event.key) - 1];
      if (next && implemented.has(next)) {
        event.preventDefault();
        setQuery('');
        setPanel(next);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  const provider = config?.llm.provider;
  useEffect(() => {
    let active = true;
    void window.companion.getAttachmentCapability().then((result) => {
      if (active && result.ok) setImageSupport(result.value);
    });
    return () => {
      active = false;
    };
  }, [config?.llm.provider, config?.llm.model, config?.llm.baseUrl, config?.llm.enableImages]);
  const secretId: SecretId | null =
    provider === 'openai-compatible' || provider === 'anthropic' ? `llm.${provider}` : null;
  const signature = JSON.stringify([
    provider,
    config?.llm.baseUrl,
    secretId ? (credentials[secretId]?.revision ?? '') : '',
  ]);
  const verified = signature === verifiedSignature;
  const onSecret = useCallback(
    (id: SecretId, value: SecretStatus) =>
      setCredentials((previous) => ({ ...previous, [id]: value })),
    [],
  );
  const testConnection = async (refresh = false) => {
    if (testing.current) return;
    testing.current = true;
    setStatus('Testing…');
    try {
      await Promise.all([flushSettings(), flushSecrets()]);
      if (refresh) {
        const result = await window.companion.listModels();
        if (result.ok) {
          setModels(result.value);
          setStatus(`${result.value.length} models available`);
        } else {
          setStatus(`Failed: ${result.error.userMessage}`);
          setVerified('');
        }
      } else {
        const result = await window.companion.testModelConnection();
        if (result.ok) {
          setModels(result.value.models);
          setStatus(`Connected — ${result.value.models.length} models found`);
          setVerified(
            JSON.stringify([
              result.value.provider,
              result.value.baseUrl,
              result.value.credentialRevision,
            ]),
          );
        } else {
          setStatus(`Failed: ${result.error.userMessage}`);
          setVerified('');
        }
      }
    } catch {
      setStatus('Failed: The connection test could not be completed.');
      setVerified('');
    } finally {
      testing.current = false;
    }
  };
  useEffect(() => {
    setModels([]);
    setStatus('Idle');
  }, [signature]);
  if (!config)
    return <main className={styles.settings}>{error && <p role="alert">{error}</p>}</main>;
  const rows = SETTINGS.filter(
    (d) =>
      d.panel === panel &&
      (!d.visible || d.visible(config)) &&
      matchesSearch(`${d.label} ${d.synonyms ?? ''}`, query),
  );
  const groups = [...new Set(rows.map((d) => d.group))];
  if (panel === 'General' && hotkeyMatches(query))
    groups.splice(Math.min(3, groups.length), 0, 'Hotkeys');
  if (panel === 'Model' && extras.Model?.some((label) => matchesSearch(label, query))) {
    if (
      (matchesSearch('API key authentication password', query) ||
        matchesSearch('Test Connection Refresh models', query)) &&
      !groups.includes('Provider')
    )
      groups.unshift('Provider');
    if (
      matchesSearch('Clear Conversation History', query) &&
      !groups.includes('Conversation Memory')
    )
      groups.push('Conversation Memory');
  }
  const reset = async () => {
    await Promise.all([flushSettings(), flushSecrets()]);
    const result = await window.companion.resetSettingsPanel(panel);
    if (result.ok && result.value.reset) {
      receive(result.value.config);
      const belongs = (key: string) =>
        SETTINGS.some((d) => d.panel === panel && `${d.section}.${d.key}` === key) ||
        (panel === 'Model' && key.startsWith('secret.llm.')) ||
        (panel === 'Voice' && key.startsWith('secret.tts.')) ||
        (panel === 'Voice Input' && key.startsWith('secret.stt.')) ||
        (panel === 'General' && key.startsWith('hotkeys.')) ||
        (panel === 'Sprites' && key.startsWith('sprite.')) ||
        (panel === 'Persona' && key.startsWith('persona.'));
      useSettingsStore.setState((state) => ({
        invalid: Object.fromEntries(Object.entries(state.invalid).filter(([key]) => !belongs(key))),
        drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => !belongs(key))),
      }));
      setResetEpoch((value) => value + 1);
      if (panel === 'Model') setVerified('');
    }
  };
  const restartRequired =
    boot.current?.window.contentProtection !== config.window.contentProtection;
  let local = false;
  try {
    const hostname = new URL(config.llm.baseUrl).hostname;
    local = hostname === 'localhost' || hostname === '[::1]' || /^127\./.test(hostname);
  } catch {
    /* Last valid config remains authoritative. */
  }
  const renderRow = (d: (typeof rows)[number]) => (
    <SettingRow
      key={`${d.section}.${d.key}`}
      definition={d}
      config={config}
      verified={verified}
      models={models.map((model) => model.id)}
      testing={testing.current}
      refreshModels={() => void testConnection(true)}
    />
  );
  const keyRow = secretId && matchesSearch('API key authentication password', query) && (
    <SecretInput
      key={secretId}
      id={secretId}
      local={local}
      verified={verified}
      onStatus={(value) => onSecret(secretId, value)}
    />
  );
  const connectionRow = provider !== 'mock' && matchesSearch('Test Connection', query) && (
    <div className={styles.row} data-control="63">
      <button
        className={styles.button}
        disabled={
          testing.current ||
          Boolean(invalid['llm.baseUrl']) ||
          Object.keys(invalid).some((key) => key.startsWith('secret.llm.'))
        }
        onClick={() => void testConnection()}
      >
        Test Connection
      </button>
      <span
        role="status"
        aria-label="Model connection"
        className={status.startsWith('Failed') ? styles.error : styles.hint}
      >
        {status}
      </span>
    </div>
  );
  const providerRows = rows.filter((d) => d.group === 'Provider');
  return (
    <main
      className={styles.settings}
      data-testid="settings"
      data-dark={config.window.settingsDarkMode}
      style={{ '--chevron': `url("${chevron}")` } as CSSProperties}
    >
      <aside className={styles.sidebar}>
        <div className={styles.search}>
          <img src={searchIcon} alt="" />
          <input
            ref={search}
            aria-label="Search settings"
            placeholder="Search settings"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <nav className={styles.nav} aria-label="Settings panels">
          {navigation.map((name) => (
            <button
              key={name}
              aria-current={panel === name ? 'page' : undefined}
              disabled={!implemented.has(name)}
              title={!implemented.has(name) ? 'This panel is not implemented yet' : undefined}
              onClick={() => setPanel(name)}
            >
              {name}
              {(SETTINGS.some((d) => d.panel === name && invalid[`${d.section}.${d.key}`]) ||
                (name === 'Model' &&
                  Object.keys(invalid).some((key) => key.startsWith('secret.llm.'))) ||
                (name === 'Voice' &&
                  Object.keys(invalid).some((key) => key.startsWith('secret.tts.'))) ||
                (name === 'General' &&
                  Object.keys(invalid).some((key) => key.startsWith('hotkeys.'))) ||
                (name === 'Sprites' &&
                  Object.keys(invalid).some((key) => key.startsWith('sprite.')))) && (
                <span className={styles.dot} data-error="true" aria-label="Invalid setting" />
              )}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarSpacer} />
        <div className={styles.darkMode}>
          <span>Dark mode</span>
          <button
            className={styles.switch}
            role="switch"
            aria-label="Dark mode"
            aria-checked={config.window.settingsDarkMode}
            onClick={() =>
              void useSettingsStore
                .getState()
                .patch('window', { settingsDarkMode: !config.window.settingsDarkMode })
            }
          >
            <img src={config.window.settingsDarkMode ? toggleOn : toggleOff} alt="" />
          </button>
        </div>
        <span className={styles.shortcutHint}>Ctrl + 1–8 to switch panels</span>
      </aside>
      <section className={styles.content}>
        <header className={styles.header}>
          <h1>{panel}</h1>
          <span>Changes apply automatically</span>
        </header>
        <div className={styles.body} key={resetEpoch}>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {groups.length === 0 &&
            !['Persona', 'Sprites', 'Voice', 'Voice Input'].includes(panel) && (
              <p>No matching settings.</p>
            )}
          {panel === 'Persona' && <PersonaPanel config={config} query={query} />}
          {panel === 'Sprites' && <SpritesPanel config={config} query={query} />}
          {panel === 'Voice' && <VoicePanel config={config} query={query} />}
          {panel === 'Voice Input' && <VoiceInputPanel config={config} query={query} />}
          {groups
            .filter(() => !['Persona', 'Sprites', 'Voice', 'Voice Input'].includes(panel))
            .map((group) => (
              <section key={group} className={styles.section}>
                <h2>{group}</h2>
                <div className={styles.group}>
                  {panel === 'Model' &&
                    group === 'Image & Attachment Handling' &&
                    config.llm.enableImages &&
                    imageSupport?.supportsImages !== true && (
                      <p className={styles.warning} role="status">
                        {imageSupport?.reason ??
                          'Vision support is unverified. This model may reject images.'}
                      </p>
                    )}
                  {panel === 'Model' && group === 'Provider' ? (
                    <>
                      {providerRows.filter((d) => d.id === 60 || d.id === 61).map(renderRow)}
                      {keyRow}
                      {connectionRow}
                      {providerRows.filter((d) => d.id !== 60 && d.id !== 61).map(renderRow)}
                      {query &&
                        !providerRows.some((d) => d.kind === 'model') &&
                        matchesSearch('Refresh models', query) && (
                          <div className={styles.row}>
                            <button
                              className={styles.button}
                              aria-label="Refresh models"
                              disabled={testing.current}
                              onClick={() => void testConnection(true)}
                            >
                              Refresh models
                            </button>
                          </div>
                        )}
                    </>
                  ) : (
                    rows.filter((d) => d.group === group).map(renderRow)
                  )}
                  {panel === 'General' && group === 'Hotkeys' && (
                    <Hotkeys config={config} query={query} />
                  )}
                  {panel === 'Model' && group === 'Conversation Memory' && (
                    <>
                      {environment?.historyWarning && (
                        <p role="alert" className={styles.error}>
                          {environment.historyWarning}
                        </p>
                      )}
                      {matchesSearch('Clear Conversation History', query) && (
                        <div className={styles.row}>
                          <button
                            className={`${styles.button} ${styles.destructive}`}
                            onClick={() =>
                              void window.companion.confirmClearHistory().then((result) => {
                                if (result.ok && result.value)
                                  void window.companion.clearConversation();
                              })
                            }
                          >
                            Clear Conversation History
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>
            ))}
          {panel === 'Appearance' && !query && <AppearancePreview config={config} />}
          <button className={`${styles.textButton} ${styles.reset}`} onClick={() => void reset()}>
            Reset this panel to defaults
          </button>
        </div>
        {restartRequired && !restartLater && (
          <footer className={styles.footer}>
            <span>Some changes need a restart.</span>
            <button className={styles.button} onClick={() => void window.companion.restartApp()}>
              Restart Now
            </button>
            <button className={styles.textButton} onClick={() => setRestartLater(true)}>
              Later
            </button>
          </footer>
        )}
      </section>
    </main>
  );
}
