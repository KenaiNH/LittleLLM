import { afterEach, it, expect, vi } from 'vitest';
import { DwellTimer } from '../../src/main/services/dwellTimer';
afterEach(() => vi.useRealTimers());
it('preserves remaining dwell through hover pauses', () => {
  vi.useFakeTimers();
  const elapsed = vi.fn(),
    timer = new DwellTimer(elapsed);
  timer.start(10000);
  vi.advanceTimersByTime(3000);
  timer.pause(true);
  vi.advanceTimersByTime(60000);
  expect(elapsed).not.toHaveBeenCalled();
  timer.pause(false);
  vi.advanceTimersByTime(6999);
  expect(elapsed).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(elapsed).toHaveBeenCalledOnce();
});
it('zero means indefinite display', () => {
  vi.useFakeTimers();
  const elapsed = vi.fn(),
    timer = new DwellTimer(elapsed);
  timer.start(0);
  vi.advanceTimersByTime(1000000);
  timer.pause(true);
  timer.pause(false);
  vi.advanceTimersByTime(1000000);
  expect(elapsed).not.toHaveBeenCalled();
});
it('a new response cancels the previous deadline', () => {
  vi.useFakeTimers();
  const elapsed = vi.fn(),
    timer = new DwellTimer(elapsed);
  timer.start(10000);
  vi.advanceTimersByTime(9000);
  timer.start(20000);
  vi.advanceTimersByTime(1000);
  expect(elapsed).not.toHaveBeenCalled();
  timer.stop();
  vi.advanceTimersByTime(60000);
  expect(elapsed).not.toHaveBeenCalled();
});
