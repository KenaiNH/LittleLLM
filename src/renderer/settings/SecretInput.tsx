import { useEffect, useRef, useState } from 'react';
import type { SecretId, SecretStatus } from '../../shared/settings';
import { useSettingsStore } from './store';
import styles from './Settings.module.css';
let pending = Promise.resolve();
export const flushSecrets = () => pending;
export function SecretInput({
  id,
  local,
  verified,
  onStatus,
}: {
  id: SecretId;
  local: boolean;
  verified: boolean;
  onStatus: (status: SecretStatus) => void;
}) {
  const [status, setStatus] = useState<SecretStatus | null>(null),
    [value, setValue] = useState(''),
    [show, setShow] = useState(false),
    [error, setError] = useState<string | null>(null);
  const dirty = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout>>();
  const editEpoch = useRef(0);
  const callback = useRef(onStatus);
  callback.current = onStatus;
  useEffect(() => {
    useSettingsStore.getState().markInvalid('secret.' + id, error);
  }, [id, error]);
  useEffect(() => {
    let active = true;
    void window.companion.getSecretStatus(id).then((result) => {
      if (!active) return;
      if (result.ok) {
        setStatus(result.value);
        callback.current(result.value);
      } else setError(result.error.userMessage);
    });
    return () => {
      active = false;
      clearTimeout(timer.current);
    };
  }, [id]);
  const save = (text: string, blur: boolean) => {
    if (!dirty.current) return;
    clearTimeout(timer.current);
    const epoch = editEpoch.current;
    pending = pending
      .then(async () => {
        const result = text
          ? await window.companion.setSecret(id, text)
          : await window.companion.clearSecret(id);
        if (result.ok) {
          setStatus(result.value);
          callback.current(result.value);
          setError(null);
          if (blur && epoch === editEpoch.current) {
            setValue('');
            setShow(false);
            dirty.current = false;
          }
        } else setError(result.error.userMessage);
      })
      .catch(() => setError('The key could not be saved securely.'));
  };
  return (
    <div className={styles.row} data-control="62">
      <label className={styles.label} htmlFor="api-key">
        API key
        <span
          className={styles.dot}
          data-verified={verified && !dirty.current}
          title={verified && !dirty.current ? 'Verified' : 'Not yet verified'}
        />
      </label>
      <div
        className={styles.control}
        data-invalid={Boolean(error)}
        data-unverified={!verified || dirty.current}
      >
        <input
          id="api-key"
          aria-label="API key"
          type={show ? 'text' : 'password'}
          value={value}
          autoComplete="off"
          spellCheck={false}
          maxLength={4096}
          placeholder={
            status?.has
              ? '••••••••' + status.last4
              : local
                ? 'Usually not required for local models'
                : 'Enter API key'
          }
          onChange={(event) => {
            const text = event.target.value;
            editEpoch.current++;
            setValue(text);
            dirty.current = true;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => save(text, false), 400);
          }}
          onBlur={() => save(value, true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save(value, true);
            }
          }}
        />
        <button
          className={styles.button}
          disabled={!value}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setShow(!show)}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
    </div>
  );
}
