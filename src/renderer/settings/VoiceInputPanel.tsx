import { useEffect, useRef, useState } from 'react';
import type { Config } from '../../shared/config';
import { VOICE_INPUT_ENABLED } from '../../shared/featureScope';
import { sttUiSchema, type SttUi } from '../../shared/stt';
import { SETTINGS, matchesSearch } from './definitions';
import { SettingRow } from './SettingRow';
import { SecretInput, flushSecrets } from './SecretInput';
import { useSettingsStore, flushSettings } from './store';
import styles from './Settings.module.css';
export function VoiceInputPanel({ config, query }: { config: Config; query: string }) {
  if (VOICE_INPUT_ENABLED) return <VoiceInputControls config={config} query={query} />;
  return (
    <section className={styles.section}>
      <h2>Provider</h2>
      <div className={styles.group}>
        <div className={styles.row} data-control={187}>
          <label className={styles.label} htmlFor="deferred-stt">
            Speech-to-text provider
          </label>
          <div className={styles.control}>
            <select id="deferred-stt" value="none" disabled>
              <option value="none">Off (text input only)</option>
            </select>
          </div>
        </div>
        <p className={styles.hint}>
          Voice input is planned for a future release. The companion accepts typed input.
        </p>
      </div>
    </section>
  );
}
function VoiceInputControls({ config, query }: { config: Config; query: string }) {
  const [ui, setUi] = useState<SttUi>(() => sttUiSchema.parse({})),
    [devices, setDevices] = useState<{ id: string; label: string }[]>([]),
    [status, setStatus] = useState('Idle'),
    [testing, setTesting] = useState(false);
  const invalid = useSettingsStore((state) => state.invalid);
  const latestUi = useRef(ui);
  latestUi.current = ui;
  const signature = JSON.stringify([config.stt.provider, config.stt.baseUrl, config.stt.model]);
  const [verified, setVerified] = useState('');
  const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
  const languages: readonly (readonly [string, string])[] = [
    ['auto', 'Detect automatically'],
    ...'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'
      .split(' ')
      .map((code) => [code, languageNames.of(code) ?? code] as const)
      .sort((a, b) => a[1].localeCompare(b[1])),
  ];
  useEffect(() => {
    let active = true;
    void window.companion.getChatUi().then((result) => {
      if (active && result.ok) setUi(result.value.stt);
    });
    const remove = window.companion.onChatUi((value) => setUi(value.stt));
    return () => {
      active = false;
      remove();
    };
  }, []);
  const captureSignature = JSON.stringify(config.stt);
  useEffect(() => {
    if (config.stt.provider === 'none' || config.stt.provider === 'mock') return;
    const refresh = () => {
      if (
        !['denied', 'no-device'].includes(latestUi.current.permission) &&
        document.visibilityState === 'visible' &&
        document.hasFocus()
      )
        void window.companion.previewMicrophone(true);
    };
    const stop = () => {
      void window.companion.previewMicrophone(false);
    };
    const visibility = () => (document.hidden ? stop() : refresh());
    refresh();
    const heartbeat = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visibility);
      stop();
    };
  }, [captureSignature]);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void window.companion.getInputDevices().then((result) => {
        if (active && result.ok) setDevices(result.value);
      });
    refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener('devicechange', refresh);
    };
  }, [ui.permission, ui.status]);
  const test = async () => {
    setTesting(true);
    setStatus('Testing…');
    try {
      await Promise.all([flushSettings(), flushSecrets()]);
      const result = await window.companion.testSttConnection();
      setVerified(result.ok ? signature : '');
      setStatus(
        result.ok
          ? `Connected — responded in ${Math.round(result.value.elapsedMs)} ms`
          : 'Failed: ' + result.error.userMessage,
      );
    } catch {
      setStatus('Failed: The connection test could not complete.');
    } finally {
      setTesting(false);
    }
  };
  const rows = SETTINGS.filter(
    (row) =>
      row.panel === 'Voice Input' &&
      (!row.visible || row.visible(config)) &&
      matchesSearch(row.label + ' ' + (row.synonyms ?? ''), query),
  );
  const groups = [...new Set(rows.map((row) => row.group))];
  const enabled = config.stt.provider !== 'none',
    http = config.stt.provider === 'openai-compatible-stt';
  if (
    http &&
    matchesSearch('API key password Test Connection', query) &&
    !groups.includes('OpenAI-compatible endpoint (Whisper)')
  )
    groups.splice(1, 0, 'OpenAI-compatible endpoint (Whisper)');
  if (
    enabled &&
    matchesSearch('Input level Test Microphone', query) &&
    !groups.includes('Input Device')
  )
    groups.push('Input Device');
  const choices: readonly (readonly [string, string])[] = [
    ['default', 'System default'],
    ...devices
      .filter((device) => device.id !== 'default')
      .map((device, index) => [device.id, device.label || `Microphone ${index + 1}`] as const),
    ...(config.stt.inputDeviceId !== 'default' &&
    !devices.some((device) => device.id === config.stt.inputDeviceId)
      ? [[config.stt.inputDeviceId, 'Unavailable microphone'] as const]
      : []),
  ];
  const selected = devices.find((device) => device.id === config.stt.inputDeviceId);
  const permissionText = {
    unrequested: 'Microphone access will be requested the first time you use voice input.',
    granted: 'Microphone access granted.',
    denied: 'Windows is blocking microphone access.',
    'no-device': 'No microphone detected.',
  }[ui.permission];
  const host = ['none', 'whisper-local', 'mock'].includes(config.stt.provider)
    ? 'this computer only'
    : (() => {
        try {
          const hostname = new URL(config.stt.baseUrl).hostname;
          return hostname === 'localhost' || hostname === '[::1]' || /^127\./.test(hostname)
            ? 'this computer only'
            : hostname;
        } catch {
          return 'the configured endpoint';
        }
      })();
  const blocked = Object.keys(invalid).some(
    (key) => key.startsWith('stt.') || key.startsWith('secret.stt.'),
  );
  const render = (row: (typeof rows)[number]) => (
    <SettingRow
      key={row.id}
      definition={row}
      config={config}
      choices={row.id === 214 ? choices : row.id === 221 ? languages : undefined}
      models={
        row.id === 192 ? ['whisper-1', 'Systran/faster-whisper-large-v3', 'base.en'] : undefined
      }
    />
  );
  return (
    <>
      {groups.map((group) => (
        <section className={styles.section} key={group}>
          <h2>{group}</h2>
          <div className={styles.group}>
            {rows
              .filter(
                (row) =>
                  row.group === group && row.id !== 192 && ![216, 217, 218, 219].includes(row.id),
              )
              .map(render)}
            {group === 'Provider' && enabled && (
              <div className={styles.row}>
                <span className={styles.hint}>{permissionText}</span>
                {ui.permission === 'denied' && (
                  <>
                    <button
                      className={styles.button}
                      onClick={() => void window.companion.openMicrophoneSettings()}
                    >
                      Open Windows Microphone Settings
                    </button>
                    <button
                      className={styles.button}
                      onClick={() => void window.companion.previewMicrophone(true)}
                    >
                      Retry
                    </button>
                  </>
                )}
                {ui.permission === 'no-device' && (
                  <button
                    className={styles.button}
                    onClick={() => void window.companion.previewMicrophone(true)}
                  >
                    ↻ Rescan
                  </button>
                )}
              </div>
            )}
            {group === 'OpenAI-compatible endpoint (Whisper)' && (
              <>
                {matchesSearch('API key password', query) && (
                  <SecretInput
                    id="stt.openai-compatible-stt"
                    controlId={191}
                    local={/localhost|127\.0\.0\.1|\[::1\]/.test(config.stt.baseUrl)}
                    verified={verified === signature && status.startsWith('Connected')}
                    onStatus={() => {
                      setStatus('Idle');
                      setVerified('');
                    }}
                  />
                )}
                {rows.filter((row) => row.id === 192).map(render)}
                {matchesSearch('Test Connection', query) && (
                  <div className={styles.row} data-control={193}>
                    <button
                      className={styles.button}
                      disabled={testing || blocked}
                      onClick={() => void test()}
                    >
                      Test Connection
                    </button>
                    <span role="status">{status}</span>
                  </div>
                )}
              </>
            )}
            {group === 'Input Device' && (
              <>
                {matchesSearch('Input level microphone', query) && (
                  <div className={styles.row} data-control={215}>
                    <span className={styles.label}>Input level</span>
                    <div className={styles.control}>
                      <meter
                        aria-label="Input level"
                        min={0}
                        max={100}
                        value={Math.round(ui.level * 100)}
                      />
                    </div>
                    <span className={styles.hint}>
                      {ui.status === 'preview' && ui.microphoneOpen
                        ? 'Microphone active for level preview'
                        : ui.microphoneOpen
                          ? 'Microphone active for recording'
                          : 'Microphone inactive'}
                    </span>
                  </div>
                )}
                {rows
                  .filter((row) => row.group === group && [216, 217, 218, 219].includes(row.id))
                  .map(render)}
                {matchesSearch('Test Microphone', query) && (
                  <div className={styles.row} data-control={220}>
                    <button
                      className={styles.button}
                      disabled={blocked || ['recording', 'transcribing'].includes(ui.status)}
                      onClick={() => void window.companion.startStt('test-microphone')}
                    >
                      Test Microphone
                    </button>
                    <span className={styles.hint}>
                      Records 3 seconds, plays it back, then transcribes.
                    </span>
                  </div>
                )}
                {selected && /loopback|stereo mix|what u hear|monitor/i.test(selected.label) && (
                  <p className={styles.warning}>
                    This looks like a playback-monitoring device. The companion may transcribe its
                    own voice.
                  </p>
                )}
              </>
            )}
            {group === 'Privacy' && (
              <div className={styles.row}>
                <div className={styles.hint}>
                  The microphone opens when you activate voice input and closes when the utterance
                  ends. Settings level preview opens it only while this panel is visible and
                  focused.
                  <br />
                  Recorded audio is held in memory and discarded after transcription. It is never
                  written to disk.
                  <br />
                  With a local provider, no audio leaves this computer.
                  <br />
                  Current provider sends audio to: {host}
                </div>
              </div>
            )}
          </div>
        </section>
      ))}
      {!enabled && (
        <p className={styles.hint}>
          Voice input is disabled. The microphone will never be accessed. The companion accepts
          typed input only.
        </p>
      )}
      {enabled && ui.notice && (
        <p role="status" className={styles.hint}>
          {ui.notice}
        </p>
      )}
    </>
  );
}
