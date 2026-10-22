import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhaseCueAudio, describeNotificationResult, playAlertSound, showSystemNotification } from './pomodoroAlert';
import { POMODORO_ALERT_SOUNDS, isPomodoroAlertSound } from './pomodoroSounds';

function stubNotification(permission: NotificationPermission, opts: { throws?: boolean; grantOnRequest?: boolean } = {}) {
	const created: Array<{ title: string; body?: string }> = [];
	const Api = vi.fn(function (this: { onclick: unknown; close: () => void }, title: string, options?: NotificationOptions) {
		if (opts.throws) throw new Error('boom');
		created.push({ title, body: options?.body });
		this.close = vi.fn();
	}) as unknown as typeof Notification & { permission: NotificationPermission };
	Object.assign(Api, {
		permission,
		requestPermission: vi.fn(async () => {
			(Api as { permission: NotificationPermission }).permission = opts.grantOnRequest ? 'granted' : 'denied';
			return Api.permission;
		}),
	});
	vi.stubGlobal('Notification', Api);
	return created;
}

describe('showSystemNotification', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('reports unsupported when the runtime has no Notification API', async () => {
		vi.stubGlobal('Notification', undefined);
		expect(await showSystemNotification('t', 'b')).toBe('unsupported');
	});

	it('shows when permission is granted', async () => {
		const created = stubNotification('granted');
		expect(await showSystemNotification('TTasks', 'Focus complete')).toBe('shown');
		expect(created).toEqual([{ title: 'TTasks', body: 'Focus complete' }]);
	});

	it('asks once when permission is undecided, and honours the answer', async () => {
		stubNotification('default', { grantOnRequest: true });
		expect(await showSystemNotification('t', 'b')).toBe('shown');
		stubNotification('default', { grantOnRequest: false });
		expect(await showSystemNotification('t', 'b')).toBe('denied');
	});

	it('is silent by default and can ask the OS to play its sound', async () => {
		const options: NotificationOptions[] = [];
		const Api = vi.fn(function (this: { close: () => void }, _t: string, o?: NotificationOptions) {
			options.push(o ?? {});
			this.close = vi.fn();
		});
		Object.assign(Api, { permission: 'granted', requestPermission: vi.fn() });
		vi.stubGlobal('Notification', Api);
		await showSystemNotification('t', 'b');
		await showSystemNotification('t', 'b', undefined, false);
		expect(options.map((o) => o.silent)).toEqual([true, false]);
	});

	it('reports denied and error without throwing', async () => {
		stubNotification('denied');
		expect(await showSystemNotification('t', 'b')).toBe('denied');
		stubNotification('granted', { throws: true });
		expect(await showSystemNotification('t', 'b')).toBe('error');
	});
});

describe('describeNotificationResult', () => {
	it('points a "shown but invisible" result at the OS settings', () => {
		expect(describeNotificationResult('shown')).toMatch(/Focus Assist/);
	});
});

describe('playAlertSound', () => {
	afterEach(() => vi.unstubAllGlobals());

	function stubAudio() {
		const peaks: number[] = [];
		const ctx = {
			currentTime: 0,
			destination: {},
			createOscillator: () => ({ frequency: {}, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() }),
			createGain: () => ({
				gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: (v: number) => peaks.push(v) },
				connect: (n: unknown) => n,
			}),
			close: vi.fn(),
		};
		const Ctor = vi.fn(() => ctx);
		vi.stubGlobal('AudioContext', Ctor);
		return { Ctor, peaks };
	}

	it('is silent at volume 0 and never opens a context', () => {
		const { Ctor } = stubAudio();
		playAlertSound('chime', 0);
		expect(Ctor).not.toHaveBeenCalled();
	});

	it('scales note level with volume', () => {
		const quiet = stubAudio();
		playAlertSound('chime', 20);
		const loud = stubAudio();
		playAlertSound('chime', 100);
		expect(Math.max(...loud.peaks)).toBeGreaterThan(Math.max(...quiet.peaks));
		expect(Math.max(...loud.peaks)).toBeLessThanOrEqual(1);
	});

	it('plays every preset without throwing, and no-ops without AudioContext', () => {
		stubAudio();
		for (const id of POMODORO_ALERT_SOUNDS) expect(() => playAlertSound(id, 80)).not.toThrow();
		vi.stubGlobal('AudioContext', undefined);
		expect(() => playAlertSound('bell', 80)).not.toThrow();
	});

	it('recognises only known sound ids', () => {
		expect(isPomodoroAlertSound('bell')).toBe(true);
		expect(isPomodoroAlertSound('kazoo')).toBe(false);
	});
});

describe('PhaseCueAudio', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	function stubClock(state: AudioContextState = 'running') {
		const starts: number[] = [];
		const stopped = vi.fn();
		const ctx = {
			currentTime: 0,
			state,
			destination: {},
			createOscillator: () => ({
				frequency: {},
				connect: (n: unknown) => n,
				start: (t: number) => starts.push(t),
				stop: (t?: number) => { if (t === undefined) stopped(); },
				disconnect: vi.fn(),
			}),
			createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n }),
			resume: vi.fn(async () => undefined),
			close: vi.fn(async () => undefined),
		};
		const Ctor = vi.fn(() => ctx);
		vi.stubGlobal('AudioContext', Ctor);
		return { ctx, Ctor, starts, stopped };
	}

	it('queues the cue on the audio clock at the phase end, once per key', () => {
		const { Ctor, starts } = stubClock();
		const cue = new PhaseCueAudio();
		cue.schedule('focus@1', 'chime', 80, 1500);
		cue.schedule('focus@1', 'chime', 80, 1499); // per-second store update — ignored
		expect(Ctor).toHaveBeenCalledTimes(1);
		expect(starts[0]).toBe(1500);
		expect(starts).toHaveLength(2); // chime = two notes
	});

	it('reports a cue as played once the audio clock reaches it', () => {
		const { ctx } = stubClock();
		const cue = new PhaseCueAudio();
		cue.schedule('focus@1', 'chime', 80, 60);
		expect(cue.hasPlayed('focus@1')).toBe(false);
		ctx.currentTime = 60;
		expect(cue.hasPlayed('focus@1')).toBe(true);
		// The next phase replaces it; the played cue is still remembered for the late tick.
		cue.schedule('short-break@2', 'bell', 80, 300);
		expect(cue.hasPlayed('focus@1')).toBe(true);
		expect(cue.hasPlayed('short-break@2')).toBe(false);
	});

	it('cancels a future cue (pause/skip) so it never sounds', () => {
		const { stopped } = stubClock();
		const cue = new PhaseCueAudio();
		cue.schedule('focus@1', 'chime', 80, 600);
		cue.cancel();
		expect(stopped).toHaveBeenCalledTimes(2);
		expect(cue.hasPlayed('focus@1')).toBe(false);
	});

	it('does not count a cue as played while the context is suspended', () => {
		const { ctx } = stubClock('suspended');
		const cue = new PhaseCueAudio();
		cue.schedule('focus@1', 'chime', 80, 0);
		expect(ctx.resume).toHaveBeenCalled();
		expect(cue.hasPlayed('focus@1')).toBe(false); // so the tick falls back to a fresh chime
	});

	it('schedules nothing at volume 0', () => {
		const { Ctor } = stubClock();
		new PhaseCueAudio().schedule('focus@1', 'chime', 0, 10);
		expect(Ctor).not.toHaveBeenCalled();
	});

	it('closes the context after a grace period on release, unless a new cue arrives', () => {
		vi.useFakeTimers();
		const { ctx } = stubClock();
		const cue = new PhaseCueAudio();
		cue.schedule('focus@1', 'chime', 80, 10);
		cue.release();
		vi.advanceTimersByTime(1000);
		cue.schedule('focus@2', 'chime', 80, 10); // restarted within the grace period
		vi.advanceTimersByTime(10_000);
		expect(ctx.close).not.toHaveBeenCalled();
		cue.release();
		vi.advanceTimersByTime(5000);
		expect(ctx.close).toHaveBeenCalledTimes(1);
	});
});
