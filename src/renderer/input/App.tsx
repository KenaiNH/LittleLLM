import { useEffect, useRef, useState } from 'react';
import type { Config } from '../../shared/config';
import mic from '../../../assets/figma/2016-81-imgMic.svg';
import continuation from '../../../assets/figma/2016-81-imgDialogueContinuation.svg';
import styles from './Input.module.css';
export function InputApp() {
  const [config, setConfig] = useState<Config | null>(null),
    [text, setText] = useState(''),
    [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let active = true;
    void window.companion.getConfig().then((result) => {
      if (active && result.ok) setConfig(result.value);
    });
    void window.companion.getChatUi().then((result) => {
      if (active && result.ok) setText(result.value.draft);
    });
    const removeConfig = window.companion.onConfig(setConfig),
      removeUi = window.companion.onChatUi((ui) => {
        setText(ui.draft);
        if (ui.inputOpen) requestAnimationFrame(() => ref.current?.focus());
      });
    return () => {
      active = false;
      removeConfig();
      removeUi();
    };
  }, []);
  const submit = async () => {
    if (!text.trim()) return;
    const result = await window.companion.submitInput(text);
    setError(result.ok ? null : result.error.userMessage);
  };
  return (
    <main className={styles.chatbox} data-testid="input">
      <div className={styles.inner}>
        <div className={styles.name}>You</div>
        <textarea
          ref={ref}
          aria-label="Your response"
          placeholder="Type a response…"
          value={text}
          maxLength={32000}
          className={styles.response}
          onChange={(event) => {
            setText(event.target.value);
            window.companion.saveDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              void window.companion.closeInput();
            } else if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              (config?.input.sendWith === 'ctrl-enter'
                ? event.ctrlKey || event.metaKey
                : !event.ctrlKey && !event.metaKey)
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {config?.stt.provider !== 'none' && config?.stt.showMicButton && (
          <button
            className={styles.mic}
            aria-label="Voice input"
            disabled
            title="Voice input will be enabled in the speech-input milestone"
          >
            <span>
              <img src={mic} alt="" />
            </span>
          </button>
        )}
        <button
          className={styles.send}
          aria-label="Send response"
          onClick={() => void submit()}
          disabled={!text.trim()}
        >
          <img src={continuation} alt="" />
        </button>
        {error && (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        )}
      </div>
    </main>
  );
}
