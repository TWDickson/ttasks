import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { PomodoroService, type PomodoroServiceDeps } from './PomodoroService';

const config = {
	focusMinutes: 25,
	shortBreakMinutes: 5,
	longBreakMinutes: 15,
	longBreakInterval: 4,
	autoStartNext: true,
};

function makeService(overrides: Partial<PomodoroServiceDeps> = {}) {
	const logFocus = vi.fn();
	const notify = vi.fn();
	const getConfig = vi.fn(() => ({ ...config }));
	const service = new PomodoroService({ getConfig, logFocus, notify, ...overrides });
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
		expect(logFocus).toHaveBeenCalledWith('a.md', 25);
		const s = get(service.session);
		expect(s?.mode).toBe('short-break');
		expect(s?.completedFocus).toBe(1);
		expect(s?.remainingSec).toBe(300);
		expect(s?.running).toBe(true);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining('logged 25m'));
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
