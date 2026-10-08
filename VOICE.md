# Voice output

Open Settings → Voice and choose a provider. Off is the default: replies remain text-only and no audio graph is created. Settings save automatically when valid. Windows built-in speech uses installed system voices offline, with no key or server.

OpenAI-compatible endpoint accepts a base URL including `/v1`, a model and a voice. Hosted OpenAI requires a key. Local endpoints can leave the key empty; examples from the specifications are `http://localhost:8880/v1` for Kokoro-FastAPI and `http://localhost:8080/v1` for LocalAI. Kokoro testing was explicitly skipped at the user's request, so compatibility and latency are unverified. Hosted speech has not been live-tested without a user key.

Test Voice plays “Hello. I'm your desktop companion.” and reports time to first audio. Speaking rate, volume, output device, begin-speaking policy and interruption policy apply to replies. The bubble speaker button mutes without changing the provider. Esc cancels synthesis, playback and the pending reply. A missing output device falls back to system default. Speech failures preserve the full text reply and follow the selected failure policy.

Speech processing has a separate copy of the response: code, links, emoji and the speech character limit never shorten the displayed response. Completed synthesized clips are cached under `userData/cache/tts` when enabled, with a 200 MiB LRU cap. Interrupted partial synthesis is not cached. API keys remain encrypted in the main process and are never returned to the renderer. Voice reset clears Voice settings and Voice keys after confirmation.

Verified on Windows: actual installed-voice enumeration, WinRT synthesis, non-silent Web Audio playback, Esc cancellation, provider-Off audio inactivity and output enumeration with microphone permission denied. OpenAI-compatible audio transport is covered by HTTP protocol fixtures. This is voice output only; microphone/STT, mouth compositing, ElevenLabs and Custom HTTP are still scheduled work.
