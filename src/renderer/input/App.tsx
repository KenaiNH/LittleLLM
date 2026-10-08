import { useEffect, useRef, useState } from 'react';
import type { Config } from '../../shared/config';
import type { Attachment, ImageCapability } from '../../shared/attachments';
import { sttUiSchema, type SttUi } from '../../shared/stt';
import { VOICE_INPUT_ENABLED } from '../../shared/featureScope';
import mic from '../../../assets/figma/2016-81-imgMic.svg';
import continuation from '../../../assets/figma/2016-81-imgDialogueContinuation.svg';
import styles from './Input.module.css';
export function InputApp() {
  const [config, setConfig] = useState<Config | null>(null),
    [text, setText] = useState(''),
    [attachments, setAttachments] = useState<Attachment[]>([]),
    [capability, setCapability] = useState<ImageCapability | null>(null),
    [error, setError] = useState<string | null>(null);
  const [stt, setStt] = useState<SttUi>(() => sttUiSchema.parse({}));
  const [now, setNow] = useState(Date.now());
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let active = true;
    void window.companion.getConfig().then((result) => {
      if (active && result.ok) setConfig(result.value);
    });
    void window.companion.getChatUi().then((result) => {
      if (active && result.ok) {
        setText(result.value.draft);
        setAttachments(result.value.attachments);
        setStt(result.value.stt);
      }
    });
    const removeConfig = window.companion.onConfig(setConfig),
      removeUi = window.companion.onChatUi((ui) => {
        setText(ui.draft);
        setAttachments(ui.attachments);
        setStt(ui.stt);
        if (ui.inputOpen && document.hasFocus() && document.activeElement === document.body)
          requestAnimationFrame(() => ref.current?.focus());
      });
    return () => {
      active = false;
      removeConfig();
      removeUi();
    };
  }, []);
  useEffect(() => {
    if (stt.status !== 'countdown') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [stt.status, stt.deadline]);
  const recording = ['starting', 'recording'].includes(stt.status);
  const voiceAction = async () => {
    const result = await window.companion.startStt();
    setError(result.ok ? null : result.error.userMessage);
  };
  useEffect(() => {
    let active = true;
    void window.companion.getAttachmentCapability().then((result) => {
      if (active && result.ok) setCapability(result.value);
    });
    return () => {
      active = false;
    };
  }, [config?.llm.provider, config?.llm.baseUrl, config?.llm.model, config?.llm.enableImages]);
  const attached = async (request: ReturnType<typeof window.companion.browseAttachments>) => {
    const result = await request;
    if (result.ok) {
      setAttachments(result.value);
      setError(null);
    } else setError(result.error.code === 'ABORTED' ? null : result.error.userMessage);
  };
  const submit = async () => {
    if (!text.trim() && !attachments.length) return;
    const result = await window.companion.submitInput(text);
    setError(result.ok ? null : result.error.userMessage);
  };
  return (
    <div
      className={styles.root}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        void attached(window.companion.attachDroppedFiles(Array.from(event.dataTransfer.files)));
      }}
    >
      {attachments.length > 0 && (
        <div className={styles.tray} role="list" aria-label="Image attachments">
          {attachments.map((item) => (
            <div role="listitem" key={item.id} className={styles.thumbnail}>
              <img
                src={item.thumbnail}
                alt={item.name}
                title={`${item.name} · ${item.width}×${item.height}`}
              />
              <button
                aria-label={`Remove ${item.name}`}
                onClick={() => void attached(window.companion.removeAttachment(item.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <main className={styles.chatbox} data-testid="input">
        <div className={styles.inner}>
          <div className={styles.name}>You</div>
          {VOICE_INPUT_ENABLED && config?.stt.provider !== 'none' && (
            <div className={styles.voiceStatus} role="status">
              {recording
                ? 'Recording…'
                : stt.status === 'transcribing'
                  ? 'Transcribing…'
                  : stt.status === 'countdown'
                    ? `Sending in ${Math.max(0, ((stt.deadline ?? now) - now) / 1000).toFixed(1)}s`
                    : stt.notice}
              {recording && <button onClick={() => void window.companion.stopStt()}>Stop</button>}
              {['starting', 'recording', 'transcribing', 'countdown'].includes(stt.status) && (
                <button onClick={() => void window.companion.abortStt()}>Cancel</button>
              )}
              {stt.status === 'idle' && (
                <button
                  title="Insert the most recent voice transcript"
                  onClick={() => void window.companion.reinsertTranscript()}
                >
                  Last transcript
                </button>
              )}
            </div>
          )}
          <button
            className={styles.attach}
            aria-label="Attach images"
            title={capability?.reason || 'Attach images'}
            disabled={
              !capability?.allowed || attachments.length >= (config?.llm.maxAttachments ?? 4)
            }
            onClick={() => void attached(window.companion.browseAttachments())}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m9 17 8-8a3 3 0 0 0-4-4L5 13a5 5 0 0 0 7 7l8-8M8 16l8-8" />
            </svg>
          </button>
          <input
            className={styles.file}
            data-testid="attachment-files"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => {
              if (event.target.files?.length)
                void attached(window.companion.attachDroppedFiles(Array.from(event.target.files)));
              event.target.value = '';
            }}
          />
          <textarea
            ref={ref}
            aria-label="Your response"
            placeholder="Type a response…"
            value={text}
            maxLength={32000}
            className={styles.response}
            onPaste={(event) => {
              if (
                Array.from(event.clipboardData.items).some(
                  (item) => item.kind === 'file' && item.type.startsWith('image/'),
                )
              ) {
                event.preventDefault();
                void attached(window.companion.attachClipboardImage());
              }
            }}
            onChange={(event) => {
              setText(event.target.value);
              window.companion.saveDraft(event.target.value);
              window.companion.saveCaret(event.target.selectionStart, event.target.selectionEnd);
            }}
            onSelect={(event) =>
              window.companion.saveCaret(
                event.currentTarget.selectionStart,
                event.currentTarget.selectionEnd,
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                void window.companion.abortChat().then(() => window.companion.closeInput());
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
          {VOICE_INPUT_ENABLED && config?.stt.provider !== 'none' && config?.stt.showMicButton && (
            <button
              className={styles.mic}
              aria-label={recording ? 'Stop voice input' : 'Voice input'}
              aria-pressed={recording}
              disabled={stt.status === 'transcribing'}
              title={recording ? 'Stop recording' : 'Start recording'}
              onClick={() => void voiceAction()}
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
            disabled={!text.trim() && !attachments.length}
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
    </div>
  );
}
