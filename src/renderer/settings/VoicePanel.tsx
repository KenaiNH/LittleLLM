import { useEffect, useState } from 'react';
import type { Config } from '../../shared/config';
import type { SecretStatus } from '../../shared/settings';
import { synthesisScope } from '../../shared/ttsCustom';
import { VoiceHeaders } from './VoiceHeaders';
import { SETTINGS, matchesSearch } from './definitions';
import { SettingRow } from './SettingRow';
import { SecretInput, flushSecrets } from './SecretInput';
import { flushSettings, useSettingsStore } from './store';
import styles from './Settings.module.css';
export function VoicePanel({ config, query }: { config: Config; query: string }) {
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [status, setStatus] = useState('Idle'),
    [testing, setTesting] = useState(false),
    [verified, setVerified] = useState(''),
    [credentials, setCredentials] = useState<SecretStatus | null>(null);
  const signature = JSON.stringify([
    synthesisScope(config.tts),
    config.tts.speed,
    credentials?.revision ?? '',
  ]);
  const secretId =
    config.tts.provider === 'openai-compatible-tts' ||
    config.tts.provider === 'elevenlabs' ||
    config.tts.provider === 'custom-http'
      ? (`tts.${config.tts.provider}` as import('../../shared/settings').SecretId)
      : null;
  const invalid = useSettingsStore((state) => state.invalid);
  useEffect(() => {
    let active = true;
    setVoices([]);
    setStatus('Idle');
    if (config.tts.provider !== 'none')
      void window.companion.listVoices().then((result) => {
        if (active) {
          if (result.ok) {
            setVoices(result.value);
            const current = useSettingsStore.getState().config;
            if (
              current?.tts.provider === 'elevenlabs' &&
              !current.tts.elevenlabs.voiceId &&
              result.value[0]
            )
              void useSettingsStore
                .getState()
                .patch('tts', { 'elevenlabs.voiceId': result.value[0].id });
          } else setStatus('Failed: ' + result.error.userMessage);
        }
      });
    return () => {
      active = false;
    };
  }, [config.tts.provider, config.tts.baseUrl, credentials?.revision]);
  useEffect(() => {
    setCredentials(null);
    setVerified('');
  }, [config.tts.provider]);
  useEffect(() => {
    if (config.tts.provider === 'none') {
      setDevices([]);
      return;
    }
    let active = true;
    const refresh = () =>
      void navigator.mediaDevices
        .enumerateDevices()
        .then((value) => {
          if (active)
            setDevices(
              value.filter(
                (device) => device.kind === 'audiooutput' && device.deviceId !== 'default',
              ),
            );
        })
        .catch(() => {
          if (active) setDevices([]);
        });
    refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener('devicechange', refresh);
    };
  }, [config.tts.provider === 'none']);
  const test = async () => {
    if (testing) return;
    setTesting(true);
    setStatus('Testing…');
    try {
      await Promise.all([flushSettings(), flushSecrets()]);
      const current = useSettingsStore.getState().config;
      if (!current) throw new Error('Settings have not loaded.');
      const before = current.tts;
      const secret = secretId ? await window.companion.getSecretStatus(secretId) : null;
      const tested = JSON.stringify([
        synthesisScope(before),
        before.speed,
        secret?.ok ? secret.value.revision : '',
      ]);
      const result = await window.companion.testVoice();
      if (result.ok) {
        setVerified(tested);
        setStatus(
          `Played test phrase — first audio in ${Math.round(result.value.firstAudioMs)} ms.`,
        );
      } else {
        setVerified('');
        setStatus('Failed: ' + result.error.userMessage);
      }
    } catch {
      setVerified('');
      setStatus('Failed: The voice test could not be completed.');
    } finally {
      setTesting(false);
    }
  };
  const rows = SETTINGS.filter(
    (row) =>
      row.panel === 'Voice' &&
      (!row.visible || row.visible(config)) &&
      matchesSearch(row.label + ' ' + (row.synonyms ?? ''), query),
  );
  const groups = [...new Set(rows.map((row) => row.group))];
  const providerGroup =
    config.tts.provider === 'elevenlabs'
      ? 'ElevenLabs'
      : config.tts.provider === 'custom-http'
        ? 'Custom HTTP endpoint'
        : 'OpenAI-compatible endpoint';
  if (
    secretId &&
    matchesSearch('API key authentication password Test Connection', query) &&
    !groups.includes(providerGroup)
  )
    groups.splice(1, 0, providerGroup);
  if (
    config.tts.provider !== 'none' &&
    matchesSearch('Test Voice', query) &&
    !groups.includes('Playback')
  )
    groups.push('Playback');
  const voiceChoices: readonly (readonly [string, string])[] = [
    [config.tts.voice === 'alloy' ? 'alloy' : '', 'System default voice'],
    ...voices.map((voice) => [voice.id, voice.name] as const),
    ...(!['', 'alloy', ...voices.map((voice) => voice.id)].includes(config.tts.voice)
      ? [[config.tts.voice, 'Unavailable voice'] as const]
      : []),
  ];
  const deviceChoices: readonly (readonly [string, string])[] = [
    ['default', 'System default'],
    ...devices.map(
      (device, index) => [device.deviceId, device.label || `Output ${index + 1}`] as const,
    ),
    ...(config.tts.outputDeviceId !== 'default' &&
    !devices.some((device) => device.deviceId === config.tts.outputDeviceId)
      ? [[config.tts.outputDeviceId, 'Unavailable output device'] as const]
      : []),
  ];
  const elevenChoices: readonly (readonly [string, string])[] = [
    ...(!config.tts.elevenlabs.voiceId
      ? [['', voices.length ? 'Choose a voice' : 'Save a key to load voices'] as const]
      : []),
    ...voices.map((voice) => [voice.id, voice.name] as const),
    ...(config.tts.elevenlabs.voiceId &&
    !voices.some((voice) => voice.id === config.tts.elevenlabs.voiceId)
      ? [[config.tts.elevenlabs.voiceId, 'Unavailable voice'] as const]
      : []),
  ];
  const activeKeys = SETTINGS.filter(
    (row) => row.panel === 'Voice' && (!row.visible || row.visible(config)),
  ).map((row) => `tts.${row.key}`);
  if (config.tts.provider === 'custom-http') activeKeys.push('tts.custom.headers');
  const blocked = Object.keys(invalid).some(
    (key) => activeKeys.includes(key) || key === 'secret.' + secretId,
  );
  const keyControl = secretId && matchesSearch('API key authentication password', query) && (
    <SecretInput
      key={secretId}
      id={secretId}
      controlId={
        config.tts.provider === 'elevenlabs' ? 91 : config.tts.provider === 'custom-http' ? 101 : 87
      }
      local={config.tts.provider !== 'elevenlabs'}
      verified={verified === signature}
      onStatus={setCredentials}
    />
  );
  const renderRow = (row: (typeof rows)[number]) => (
    <SettingRow
      key={row.id}
      definition={row}
      config={config}
      verified={verified === signature}
      choices={
        row.id === 84
          ? voiceChoices
          : row.id === 92
            ? elevenChoices
            : row.id === 106
              ? deviceChoices
              : undefined
      }
      models={
        row.id === 88
          ? ['tts-1', 'tts-1-hd', 'kokoro']
          : row.id === 89
            ? voices.length
              ? voices.map((voice) => voice.id)
              : ['alloy', 'af_bella']
            : undefined
      }
    />
  );
  return (
    <>
      {groups.map((group) => (
        <section className={styles.section} key={group}>
          <h2>{group}</h2>
          <div className={styles.group}>
            {group === 'ElevenLabs' && keyControl}
            {rows
              .filter(
                (row) => row.group === group && ![88, 89, 90, 102, 103, 104, 105].includes(row.id),
              )
              .map(renderRow)}
            {group === 'OpenAI-compatible endpoint' && (
              <>
                {keyControl}
                {rows
                  .filter((row) => row.group === group && [88, 89, 90].includes(row.id))
                  .map(renderRow)}
                {matchesSearch('Test Connection', query) && (
                  <div className={styles.row}>
                    <button
                      className={styles.button}
                      disabled={testing || blocked}
                      onClick={() => void test()}
                    >
                      Test Connection
                    </button>
                    <span className={styles.hint}>
                      Tests synthesis and playback with the current provider.
                    </span>
                  </div>
                )}
              </>
            )}
            {group === 'Custom HTTP endpoint' && (
              <>
                {matchesSearch('Headers API key request', query) && (
                  <VoiceHeaders headers={config.tts.custom.headers} />
                )}
                {keyControl}
                {rows
                  .filter((row) => row.group === group && [102, 103, 104, 105].includes(row.id))
                  .map(renderRow)}
              </>
            )}
            {group === 'Playback' && matchesSearch('Test Voice', query) && (
              <div className={styles.row} data-control={111}>
                <button
                  className={styles.button}
                  disabled={testing || blocked}
                  onClick={() => void test()}
                >
                  Test Voice
                </button>
              </div>
            )}
          </div>
        </section>
      ))}
      {config.tts.provider === 'none' && (
        <p className={styles.hint}>
          The companion will respond in text only. The speaking animation will follow the text as it
          streams in.
        </p>
      )}
      {config.tts.provider !== 'none' && (
        <p
          role="status"
          aria-label="Voice test"
          className={status.startsWith('Failed') ? styles.error : styles.hint}
        >
          {status}
        </p>
      )}
    </>
  );
}
