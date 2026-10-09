import { afterEach, describe, expect, it, vi } from 'vitest';
import { POMODORO_ALERT_SOUNDS, describeNotificationResult, isPomodoroAlertSound, playAlertSound, showSystemNotification } from './pomodoroAlert';

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
