# Phase 8 acceptance

The automated fixture tests exercise the production HTTP transport, validated IPC, and rendered bubble without calling an external model. They do not satisfy the specification's real-model criterion.

Start LM Studio's local server, or Ollama with a loaded model, then run:

```powershell
npm.cmd run build
npm.cmd run smoke:local -- http://localhost:1234/v1 "your-loaded-model-id"
# Ollama's OpenAI-compatible endpoint:
npm.cmd run smoke:local -- http://localhost:11434/v1 "your-loaded-model-id"
```

The check uses a fresh temporary profile, no API key, the production OpenAI-compatible provider, and a short greeting prompt. It requires multiple text deltas, a terminal completion, and visible bubble text. It reports latency and the reply, closes the app, and removes only its own temporary profile. It does not change your saved companion settings.

Phase 8 is accepted. No existing server was responding at localhost ports 1234 or 11434, so the check used an official signed portable Ollama 0.40.1 CPU runtime in ignored `.tmp`, with its server profile and model storage confined to that directory. SmolLM2 `135m-instruct-q4_K_M` returned 15 text deltas to the production bubble without an API key, with first-token latency 1168.5 ms and total latency 1292.2 ms. See [saved evidence](design/real-model-acceptance.json). The server was stopped, its generated profile removed, and the companion's saved settings left intact.

Main §14 says: “Do not proceed until the step's acceptance criterion passes.” This real-model check satisfies that gate. The fixture tests alone did not.

The test runtime came from [Ollama's official standalone Windows release](https://github.com/ollama/ollama/releases/tag/v0.40.1); only the CLI and CPU libraries were extracted using bounded ranges, ZIP path/CRC validation, and an Authenticode check. The test model is [SmolLM2 135M Q4](https://ollama.com/library/smollm2:135m-instruct-q4_K_M).

Implementation references: [OpenAI Chat Completion API](https://developers.openai.com/api/reference/resources/chat), [Chromium Windows wheel routing](https://github.com/chromium/chromium/blob/main/ui/base/win/mouse_wheel_util.cc), [Windows layered-window hit testing](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features), and [Highlight.js API](https://highlightjs.readthedocs.io/en/latest/api.html).
