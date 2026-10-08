import { useEffect, useRef } from 'react';
import type { Config } from '../../shared/config';
import type { AudioPlayer } from '../audio/AudioPlayer';
export function useSpeech(config: Config | null) {
  const cfg = useRef(config); cfg.current = config;
  const player = useRef<AudioPlayer | null>(null);
  useEffect(() => { if(config) player.current?.configure(config.tts); }, [config]);
  useEffect(() => {
    let disposed = false;
    let loading: Promise<AudioPlayer> | null = null;
    const remove = window.companion.onTTSAudio(event => {
      if (!cfg.current || cfg.current.tts.provider === 'none') return;
      if (player.current) { player.current.receive(event); return; }
      // The audio module is never imported for an Off/text-only session.
      loading ??= import('../audio/AudioPlayer').then(({ AudioPlayer }) => {
        const next = new AudioPlayer(cfg.current!.tts, value => window.companion.speechFeedback(value));
        if (disposed) void next.dispose(); else player.current = next;
        return next;
      });
      void loading.then(next => { if(!disposed && cfg.current?.tts.provider !== 'none') next.receive(event); });
    });
    return () => { disposed = true; remove(); void player.current?.dispose(); player.current = null; };
  }, []);
}
