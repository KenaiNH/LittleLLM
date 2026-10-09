# Performance optimization handoff

The user deferred optimization after the standalone measurements below. Do not treat the memory/cold-start budget misses as release blockers for the current scoped plan. Resume separately; do not change the Electron/React architecture without approval.

An isolated fresh-data development build, without Playwright or a debugger, painted the default sprite in **1,562 ms** from parent-process launch. After settling:

| Measurement                   |   Visible |    Hidden |
| ----------------------------- | --------: | --------: |
| Mean CPU across app processes |    0.116% |    0.086% |
| Sum of working sets           | 373.14 MB | 371.94 MB |
| Sum of private bytes          | 206.31 MB | 205.47 MB |

These are one-run measurements on this Windows development machine with static placeholders, not proof of animated-sprite, clean-VM or packaged performance. Working-set sums include shared pages counted in each process; private bytes are reported separately, not substituted for the specification's metric. CPU is under 2%; memory exceeds 180 MB and cold start exceeds 1.5 seconds. No pass is claimed for those two budgets.

A minimal transparent Electron window on the same machine used approximately **290.52 MB summed working sets / 113.48 MB private bytes**. App overhead still merits investigation, but Electron's baseline matters when interpreting the absolute target.

## Reproduce later

```powershell
npm.cmd run build
node scripts/measure-performance.mjs
node scripts/measure-performance.mjs dist/win-unpacked/LittleLLM.exe
```

The script creates isolated temporary userData, launches without a debugger, samples a painted sprite and visible/hidden processes, writes an isolated performance.json, exits and removes its own directory. Login registration is suppressed for the explicit test-data environment.

The main probe runs only with both LITTLELLM_TEST_USER_DATA and LITTLELLM_MEASURE_PERFORMANCE=1. Ordinary launches do not run it. It reports process metrics, never prompts, images or keys.

## Next investigation

- Repeat packaged and animated-sprite measurements on a clean VM and representative hardware.
- Compare main image-library loading, preload/schema cost and renderer parsing against a minimal Electron baseline.
- Check decoded caches and bitmap release across repeated imports and transitions.
- Consider lazy image processing only if profiling warrants it; preserve all image formats, frame modes and alpha masks. No decoder rewrite was made during this deferral.
- Do not disable GPU, security or provider behavior to manufacture a budget pass.
