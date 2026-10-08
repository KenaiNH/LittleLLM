import { useEffect, useState } from 'react';
import type { Config } from '../../shared/config';
import { VOICE_INPUT_ENABLED } from '../../shared/featureScope';
import { matchesSearch } from './definitions';
import { useSettingsStore } from './store';
import styles from './Settings.module.css';
export const HOTKEY_ACTIONS = [
  ['focus', 'Open input box / focus companion', 15],
  ['visibility', 'Show / hide sprite', 16],
  ['clipboard', 'Send clipboard contents to companion', 18],
  ['clickThrough', 'Toggle click-through', 19],
  ['voice', 'Voice input (push-to-talk / toggle)', 184],
  ['voiceSend', 'Voice input and send immediately', 185],
  ['muteMic', 'Mute microphone', 186],
  ['nextPersona', 'Cycle to the next persona', 268],
] as const;
const activeHotkeys = () =>
  HOTKEY_ACTIONS.filter(
    ([key]) => VOICE_INPUT_ENABLED || !['voice', 'voiceSend', 'muteMic'].includes(key),
  );
export const hotkeyMatches = (query: string) =>
  [...activeHotkeys().map(([, label]) => label), 'Stop speaking / cancel generation'].some(
    (label) => matchesSearch(label + ' hotkeys shortcut keyboard', query),
  );
const chord = (event: KeyboardEvent) => {
  const names: Record<string, string> = {
    ' ': 'Space',
    ',': ',',
    Escape: 'Esc',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
  };
  return [
    ...(event.ctrlKey ? ['Control'] : []),
    ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
    ...(event.metaKey ? ['Super'] : []),
    names[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key),
  ].join('+');
};
const display = (value: string) =>
  value ? value.replaceAll('Control', 'Ctrl').replaceAll('+', ' + ') : 'Unbound';
export function Hotkeys({ config, query }: { config: Config; query: string }) {
  const [recording, setRecording] = useState<keyof Config['hotkeys'] | null>(null),
    [error, setError] = useState<string | null>(null);
  const patch = useSettingsStore((state) => state.patch);
  useEffect(() => {
    if (!recording) return;
    const record = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        return;
      }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
      const value = chord(event),
        conflict = activeHotkeys().find(
          ([key]) => key !== recording && config.hotkeys[key].toLowerCase() === value.toLowerCase(),
        );
      const fail = (message: string) => {
        setError(message);
        useSettingsStore.getState().markInvalid('hotkeys.' + recording, message);
        setRecording(null);
      };
      if (conflict) {
        fail(`Already assigned to "${conflict[1]}"`);
        return;
      }
      if (
        [
          'Alt+Tab',
          'Alt+F4',
          'Control+Alt+Delete',
          'Super+L',
          'Control+Esc',
          'Super+D',
          'Super+Tab',
        ].includes(value)
      ) {
        fail('This shortcut is reserved by Windows');
        return;
      }
      useSettingsStore.getState().markInvalid('hotkeys.' + recording, null);
      void patch('hotkeys', { [recording]: value }).then(setError);
      setRecording(null);
    };
    document.addEventListener('keydown', record, true);
    return () => document.removeEventListener('keydown', record, true);
  }, [recording, config.hotkeys, patch]);
  const rows = activeHotkeys().filter(
    ([key, label]) =>
      (!['voice', 'voiceSend', 'muteMic'].includes(key) || config.stt.provider !== 'none') &&
      (key !== 'nextPersona' || (config.persona.enabled && config.persona.library.length >= 2)) &&
      matchesSearch(label + ' hotkeys shortcut keyboard', query),
  );
  return (
    <>
      <table className={styles.hotkeys}>
        <tbody>
          {rows.map(([key, label, id]) => (
            <tr key={key} data-control={id}>
              <td>{label}</td>
              <td>{recording === key ? 'Press a shortcut…' : display(config.hotkeys[key])}</td>
              <td>
                <button
                  className={styles.button}
                  onClick={() => {
                    setError(null);
                    setRecording(key);
                  }}
                  aria-label={`Record ${label}`}
                >
                  Record
                </button>
                <button
                  className={styles.button}
                  onClick={() => {
                    useSettingsStore.getState().markInvalid('hotkeys.' + key, null);
                    void patch('hotkeys', { [key]: '' }).then(setError);
                  }}
                  aria-label={`Clear ${label}`}
                >
                  Clear
                </button>
              </td>
            </tr>
          ))}
          {matchesSearch('Stop speaking / cancel generation hotkeys keyboard', query) && (
            <tr
              data-control="20"
              style={{ opacity: 0.55 }}
              title="Always available while the companion is generating or speaking."
            >
              <td>Stop speaking / cancel generation</td>
              <td>Esc</td>
              <td>
                <button className={styles.button} disabled>
                  Record
                </button>
                <button className={styles.button} disabled>
                  Clear
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
    </>
  );
}
