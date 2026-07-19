import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { PomodoroService, type PomodoroServiceDeps } from './PomodoroService';

const config = {
	focusMinutes: 25,
	shortBreakMinutes: 5,
	longBreakMinutes: 15,
	longBreakInterval: 4,
	autoStartNext: true,
	logPartialOnStop: true,
};

function makeService(overrides: Partial<PomodoroServiceDeps> = {}) {
	const logFocus = vi.fn();
	const notify = vi.fn();
	const getConfig = vi.fn(() => ({ ...config }));
	const now = () => Date.now(); // fake timers drive Date.now via advanceTimersByTime
	const service = new PomodoroService({ getConfig, logFocus, notify, now, ...overrides });
	return { service, logFocus, notify, getConfig };
}

/** Advance the fake clock by whole seconds through the 1s interval. */
function advanceSeconds(seconds: number) {
	vi.advanceTimersByTime(seconds * 1000);
}

describe('PomodoroService', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it('start begins a running focus session and notifies', () => {
		const { service, notify } = makeService();
		service.start('a/b.md', 'Task B');
		const s = get(service.session);
		expect(s).toMatchObject({ taskPath: 'a/b.md', taskName: 'Task B', mode: 'focus', running: true });
		expect(s?.remainingSec).toBe(1500);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining('Task B'));
		service.dispose();
	});

	it('ticks down one second at a time', () => {
		const { service } = makeService();
		service.start('a.md', 'A');
		advanceSeconds(10);
		expect(get(service.session)?.remainingSec).toBe(1490);
		service.dispose();
	});

	it('logs the focus session and advances to a short break on completion', () => {
		const { service, logFocus, notify } = makeService();
		service.start('a.md', 'A');
		advanceSeconds(1500); // full focus phase
		expect(logFocus).toHaveBeenCalledWith({ taskPath: 'a.md', taskName: 'A', minutes: 25, mode: 'focus', partial: false });
		const s = get(service.session);
		expect(s?.mode).toBe('short-break');
		expect(s?.completedFocus).toBe(1);
		expect(s?.remainingSec).toBe(300);
		expect(s?.running).toBe(true);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining('logged 25m'));
		service.dispose();
	});

	it('runs an untethered session and logs it with null task fields', () => {
		const { service, logFocus, notify } = makeService();
		service.start(null, null);
		expect(get(service.session)).toMatchObject({ taskPath: null, taskName: null, mode: 'focus' });
		expect(notify).toHaveBeenCalledWith(expect.stringContaining('Focus'));
		advanceSeconds(1500);
		expect(logFocus).toHaveBeenCalledWith({ taskPath: null, taskName: null, minutes: 25, mode: 'focus', partial: false });
		expect(notify).toHaveBeenCalledWith('Focus complete — logged 25m');
		service.dispose();
	});

	it('startUntil refuses when no focus fits and does not start', () => {
		const { service, notify } = makeService();
		const started = service.startUntil('a.md', 'A', 0);
		expect(started).toBe(false);
		expect(get(service.session)).toBeNull();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining('Not enough time'));
		service.dispose();
	});

	it('focus-until runs whole cycles then stops cleanly at the target', () => {
		const { service, logFocus } = makeService();
		// 55 min = focus 25 + break 5 + focus 25, ending exactly at the target.
		expect(service.startUntil('a.md', 'A', 55)).toBe(true);
		expect(get(service.session)?.targetEndMs).not.toBeNull();
		advanceSeconds(1500); // focus 1 done
		expect(get(service.session)?.mode).toBe('short-break');
		advanceSeconds(300); // break done
		expect(get(service.session)?.mode).toBe('focus');
		advanceSeconds(1500); // focus 2 done → target reached, no room for another phase
		expect(get(service.session)).toBeNull();
		expect(logFocus).toHaveBeenCalledTimes(2);
		expect(logFocus).toHaveBeenLastCalledWith({ taskPath: 'a.md', taskName: 'A', minutes: 25, mode: 'focus', partial: false });
		service.dispose();
	});

	it('focus-until fills the leftover gap with a shortened final focus', () => {
		const { service, logFocus } = makeService();
		// 33 min = focus 25 + break 5, then only 3 min left → a 3-min fill focus.
		expect(service.startUntil(null, null, 33)).toBe(true);
		advanceSeconds(1500); // focus done
		advanceSeconds(300); // break done → fill focus armed
		const fill = get(service.session);
		expect(fill?.mode).toBe('focus');
		expect(fill?.isFill).toBe(true);
		expect(fill?.remainingSec).toBe(180);
		advanceSeconds(180); // fill done → target reached
		expect(get(service.session)).toBeNull();
		expect(logFocus).toHaveBeenCalledTimes(2);
		expect(logFocus).toHaveBeenLastCalledWith({ taskPath: null, taskName: null, minutes: 3, mode: 'focus', partial: false });
		service.dispose();
	});

	it('takes a long break after the configured interval of focus sessions', () => {
		const { service, logFocus } = makeService();
		service.start('a.md', 'A');
		// 4 focus + 3 short breaks + the 4th focus lands on a long break.
		advanceSeconds(1500); // focus 1 -> short break
		advanceSeconds(300);  // short break -> focus 2
		advanceSeconds(1500); // focus 2 -> short break
		advanceSeconds(300);
		advanceSeconds(1500); // focus 3 -> short break
		advanceSeconds(300);
		advanceSeconds(1500); // focus 4 -> LONG break
		expect(logFocus).toHaveBeenCalledTimes(4);
		const s = get(service.session);
		expect(s?.mode).toBe('long-break');
		expect(s?.completedFocus).toBe(4);
		expect(s?.remainingSec).toBe(900);
		service.dispose();
	});

	it('pauses the next phase when autoStartNext is off', () => {
		const { service } = makeService({ getConfig: () => ({ ...config, autoStartNext: false }) });
		service.start('a.md', 'A');
		advanceSeconds(1500);
		const s = get(service.session);
		expect(s?.mode).toBe('short-break');
		expect(s?.running).toBe(false);
		// Paused: the clock should not advance.
		advanceSeconds(60);
		expect(get(service.session)?.remainingSec).toBe(300);
		service.dispose();
	});

	it('pause halts ticking; resume continues', () => {
		const { service } = makeService();
		service.start('a.md', 'A');
		advanceSeconds(5);
		service.pause();
		advanceSeconds(60);
		expect(get(service.session)?.remainingSec).toBe(1495);
		service.resume();
		advanceSeconds(5);
		expect(get(service.session)?.remainingSec).toBe(1490);
		service.dispose();
	});

	it('stop clears the session', () => {
		const { service, notify } = makeService();
		service.start('a.md', 'A');
		service.stop();
		expect(get(service.session)).toBeNull();
		expect(notify).toHaveBeenCalledWith('Pomodoro stopped');
		service.dispose();
	});

	it('stop logs elapsed focus minutes as a partial session', () => {
		const { service, logFocus } = makeService();
		service.start('a.md', 'A');
		advanceSeconds(630); // 10.5 min elapsed → floors to 10
		service.stop();
		expect(logFocus).toHaveBeenCalledTimes(1);
		expect(logFocus).toHaveBeenCalledWith({ taskPath: 'a.md', taskName: 'A', minutes: 10, mode: 'focus', partial: true });
		service.dispose();
	});

	it('stop logs the partial even while paused', () => {
		const { service, logFocus } = makeService();
		service.start('a.md', 'A');
		advanceSeconds(120); // 2 min elapsed
		service.pause();
		service.stop();
		expect(logFocus).toHaveBeenCalledWith({ taskPath: 'a.md', taskName: 'A', minutes: 2, mode: 'focus', partial: true });
		service.dispose();
	});

	it('stop does not log a sub-minute focus', () => {
		const { service, logFocus } = makeService();
		service.start('a.md', 'A');
		advanceSeconds(45); // under a minute
		service.stop();
		expect(logFocus).not.toHaveBeenCalled();
		service.dispose();
	});

	it('stop does not log a partial during a break phase', () => {
		const { service, logFocus } = makeService();
		service.start('a.md', 'A');
		advanceSeconds(1500); // focus complete → short break (logs the full focus)
		logFocus.mockClear();
		advanceSeconds(60); // 1 min into the break
		service.stop();
		expect(logFocus).not.toHaveBeenCalled();
		service.dispose();
	});

	it('stop does not log a partial when the setting is off', () => {
		const { service, logFocus } = makeService({ getConfig: () => ({ ...config, logPartialOnStop: false }) });
		service.start('a.md', 'A');
		advanceSeconds(300); // 5 min elapsed
		service.stop();
		expect(logFocus).not.toHaveBeenCalled();
		service.dispose();
	});

	it('skip advances phase without logging a focus', () => {
		const { service, logFocus } = makeService();
		service.start('a.md', 'A');
		advanceSeconds(30);
		service.skip();
		expect(logFocus).not.toHaveBeenCalled();
		expect(get(service.session)?.mode).toBe('short-break');
		service.dispose();
	});

	it('toggle flips running state', () => {
		const { service } = makeService();
		service.start('a.md', 'A');
		service.toggle();
		expect(get(service.session)?.running).toBe(false);
		service.toggle();
		expect(get(service.session)?.running).toBe(true);
		service.dispose();
	});
});
