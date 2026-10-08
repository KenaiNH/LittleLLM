import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from './store';
import styles from './Settings.module.css';
export function VoiceHeaders({ headers }: { headers: Record<string, string> }) {
  const [rows, setRows] = useState<string[][]>(() => {
    const draft = useSettingsStore.getState().drafts['tts.custom.headers'];
    return draft ? (JSON.parse(draft) as string[][]) : Object.entries(headers);
  });
  const error = useSettingsStore((state) => state.invalid['tts.custom.headers']);
  const editEpoch = useRef(0);
  const dirty = useSettingsStore((state) => state.drafts['tts.custom.headers']);
  useEffect(() => {
    if (!dirty) setRows(Object.entries(headers));
  }, [headers, dirty]);
  const edit = (next: string[][]) => {
    editEpoch.current++;
    setRows(next);
    useSettingsStore.getState().draft('tts.custom.headers', JSON.stringify(next));
  };
  const save = async (next = rows) => {
    const epoch = editEpoch.current;
    const names = next.map(([name]) => (name ?? '').trim());
    if (
      names.some((name) => !/^[!#$%&'*+.^_`|~\w-]+$/.test(name)) ||
      new Set(names.map((name) => name.toLowerCase())).size !== names.length
    ) {
      useSettingsStore
        .getState()
        .markInvalid('tts.custom.headers', 'Enter distinct valid header names.');
      return;
    }
    const message = await useSettingsStore.getState().patch('tts', {
      'custom.headers': Object.fromEntries(next.map(([, value], index) => [names[index], value])),
    });
    if (epoch !== editEpoch.current) return;
    useSettingsStore.getState().markInvalid('tts.custom.headers', message);
    if (!message) useSettingsStore.getState().draft('tts.custom.headers', null);
  };
  return (
    <div className={styles.row} data-control={100}>
      <span className={styles.label}>Headers</span>
      <div className={`${styles.control} ${styles.headerEditor}`}>
        {rows.map(([name, value], index) => (
          <div className={styles.headerPair} key={index}>
            <input
              aria-label={`Header name ${index + 1}`}
              value={name}
              maxLength={200}
              onChange={(event) =>
                edit(
                  rows.map((row, at) => (at === index ? [event.target.value, value ?? ''] : row)),
                )
              }
              onBlur={() => void save()}
            />
            <input
              aria-label={`Header value ${index + 1}`}
              value={value}
              maxLength={4096}
              onChange={(event) =>
                edit(rows.map((row, at) => (at === index ? [name ?? '', event.target.value] : row)))
              }
              onBlur={() => void save()}
            />
            <button
              className={styles.button}
              aria-label={`Remove header ${index + 1}`}
              onClick={() => {
                const next = rows.filter((_, at) => at !== index);
                edit(next);
                void save(next);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className={styles.button} onClick={() => edit([...rows, ['', '']])}>
          Add header
        </button>
      </div>
      <div className={styles.hint}>Use {'{{apiKey}}'} to reference the encrypted API key.</div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
    </div>
  );
}
