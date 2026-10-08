
# Desktop AI Sprite Companion — Codex Instructions

## Project
Build a Windows desktop AI sprite companion using
Electron, TypeScript, React 18, Vite, and Zustand.

## Authoritative Specifications
Read these before implementation:
- docs/specifications/desktop_companion_spec.md
- docs/specifications/settings_window_spec.md

Do not treat this AGENTS.md as a replacement for
the full specifications.

## Document Precedence
Follow Section 0.1 of desktop_companion_spec.md.

- Main spec: architecture, schemas, runtime,
  security, and technical implementation.
- Settings spec: UI controls, labels, options,
  ranges, defaults, and visibility.
- Section 16: binding conflict resolutions.
- Record unresolved discrepancies in
  docs/DISCREPANCIES.md.

Never silently discard requirements.

## Implementation Workflow
1. Read both specifications completely.
2. Review Sections 16, 17, and 18.
3. Follow the build sequence in Section 14.
4. Create docs/implementation-plan.md.
5. Implement one build phase at a time.
6. Run relevant tests after each phase.
7. Update docs/progress.md.
8. Report blockers and incomplete requirements.

## Technical Requirements
- Follow the specified technology stack.
- Use TypeScript strict mode.
- Keep Windows-specific APIs in the designated
  platform directory.
- Validate IPC payloads with Zod.
- Keep API secrets out of renderer processes.
- Maintain pluggable LLM, TTS, and STT providers.
- Preserve the specified security requirements.

## Quality Control
- Do not claim features work without testing.
- Run unit tests, lint, and type checking.
- Run Electron smoke tests when possible.
- Document Windows-only tests that cannot run
  in the current environment.
- Do not substitute mock behavior for completed
  production functionality.
- Ask before making architectural changes that
  contradict the specifications.
