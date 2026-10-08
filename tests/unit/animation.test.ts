import { describe, it, expect } from 'vitest';
import { AnimationClock, sheetFrames, mouthFrame } from '../../src/shared/animation';
import { spriteStateSchema } from '../../src/shared/config';
describe('sheet layout', () => {
  it('derives all sheet rows and columns', () =>
    expect(
      sheetFrames(96, 64, spriteStateSchema.parse({ frameWidth: 32, frameHeight: 32 })),
    ).toHaveLength(6));
  it('uses column-major order', () =>
    expect(
      sheetFrames(
        96,
        64,
        spriteStateSchema.parse({ frameWidth: 32, frameHeight: 32, frameOrder: 'column-major' }),
      )[2],
    ).toEqual({ x: 32, y: 0, width: 32, height: 32 }));
  it('rejects out-of-bounds and capped frame counts', () =>
    expect(() =>
      sheetFrames(
        32,
        32,
        spriteStateSchema.parse({ frameWidth: 32, frameHeight: 32, frameCount: 2 }),
      ),
    ).toThrow());
});
describe('clock', () => {
  it('respects fps across differing display refresh rates', () => {
    for (const refresh of [60, 144]) {
      const clock = new AnimationClock(Array(20).fill(100), 'loop');
      clock.tick(0);
      for (let n = 1; n <= refresh; n++) clock.tick((n * 1000) / refresh);
      expect(clock.frame).toBe(10);
    }
  });
  it('uses GIF frame delays', () => {
    const c = new AnimationClock([50, 200, 100], 'loop');
    c.tick(0);
    expect(c.tick(100).frame).toBe(1);
    expect(c.tick(251).frame).toBe(2);
  });
  it('holds or returns to idle once finished', () => {
    for (const mode of ['once-hold', 'once-idle'] as const) {
      const c = new AnimationClock([100, 100], mode);
      c.tick(0);
      expect(c.tick(300)).toEqual({ frame: 1, changed: true, returnToIdle: mode === 'once-idle' });
    }
  });
  it('ping-pongs without duplicate endpoint frames', () => {
    const c = new AnimationClock([100, 100, 100], 'ping-pong');
    c.tick(0);
    expect([100, 200, 300, 400, 500].map((t) => c.tick(t).frame)).toEqual([1, 2, 1, 0, 1]);
  });
  it('pauses without jumping on visibility resume', () => {
    const c = new AnimationClock([100, 100, 100], 'loop');
    c.tick(0);
    c.tick(110);
    c.pause();
    expect(c.tick(10000).frame).toBe(1);
    expect(c.tick(10090).frame).toBe(2);
  });
});
it('closes mouth below silence threshold and quantizes amplitude', () => {
  expect(
    mouthFrame(0.03, 1, { smoothing: 0.6, sensitivity: 1, silenceThreshold: 0.04, frameCount: 3 })
      .index,
  ).toBe(0);
  expect(
    mouthFrame(1, 0, { smoothing: 0, sensitivity: 1, silenceThreshold: 0.04, frameCount: 3 }).index,
  ).toBe(2);
});
