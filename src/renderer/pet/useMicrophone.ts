import { useEffect, useRef } from 'react';
import type { Config } from '../../shared/config';
import { VOICE_INPUT_ENABLED } from '../../shared/featureScope';
import type { MicRecorder } from '../stt/MicRecorder';
export function useMicrophone(config: Config | null) {
  const current = useRef(config);
  current.current = config;
  const recorder = useRef<MicRecorder | null>(null),
    loading = useRef<Promise<MicRecorder> | null>(null);
  useEffect(() => {
    if (!VOICE_INPUT_ENABLED) return;
    let active = true;
    let latest: string | null = null;
    const remove = window.companion.onSttCapture((packet) => {
      if (packet.type === 'heartbeat') {
        recorder.current?.renew(packet.sessionId);
        return;
      }
      if (packet.type === 'stop') {
        if (latest === packet.sessionId) latest = null;
        if (recorder.current) void recorder.current.stop(packet.sessionId);
        else window.companion.sttFeedback({ type: 'released', sessionId: packet.sessionId });
        return;
      }
      if (current.current?.stt.provider === 'none') return;
      latest = packet.sessionId;
      loading.current ??= import('../stt/MicRecorder').then(
        ({ MicRecorder }) => (recorder.current = new MicRecorder()),
      );
      void loading.current
        .then(async (value) => {
          if (!active || latest !== packet.sessionId || current.current?.stt.provider === 'none')
            return;
          if (packet.type === 'start') await value.start(packet);
          else await value.play(packet);
        })
        .catch(() =>
          window.companion.sttFeedback({
            type: 'error',
            sessionId: packet.sessionId,
            code: 'capture-error',
          }),
        );
    });
    return () => {
      active = false;
      remove();
      void recorder.current?.stop();
    };
  }, []);
  useEffect(() => {
    if (config?.stt.provider === 'none') void recorder.current?.stop();
  }, [config?.stt.provider]);
}
