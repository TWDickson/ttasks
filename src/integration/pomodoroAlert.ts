// Attention cues for a Pomodoro phase boundary: a short synthesized chime and a
// desktop OS notification. NO Obsidian imports — enforced by
// architectureBoundaries.test.ts. main.ts decides *whether* to fire each (the
// settings + Platform gate); this only knows *how*, and fails silently where the
// runtime lacks the API (mobile WebViews, tests).

type AudioContextCtor = new () => AudioContext;

export const POMODORO_ALERT_SOUNDS = ['chime', 'bell', 'marimba', 'beep', 'alarm'] as const;
export type PomodoroAlertSound = (typeof POMODORO_ALERT_SOUNDS)[number];

export const POMODORO_ALERT_SOUND_LABELS: Record<PomodoroAlertSound, string> = {
	chime: 'Chime — two soft notes',
	bell: 'Bell — long ring',
	marimba: 'Marimba — rising arpeggio',
	beep: 'Beep — three short beeps',
	alarm: 'Alarm — insistent, hard to miss',
};

export function isPomodoroAlertSound(value: unknown): value is PomodoroAlertSound {
	return (POMODORO_ALERT_SOUNDS as readonly string[]).includes(value as string);
}

/** One synthesized note: frequency (Hz), start offset (s), length (s), waveform, relative level. */
type Note = [freq: number, at: number, dur: number, wave: OscillatorType, level: number];

const SOUNDS: Record<PomodoroAlertSound, Note[]> = {
	chime: [[659.25, 0, 0.42, 'sine', 1], [880, 0.18, 0.42, 'sine', 1]],
	bell: [[1046.5, 0, 1.4, 'triangle', 1], [2093, 0, 1.0, 'sine', 0.4], [1046.5, 0.5, 1.2, 'triangle', 0.7]],
	marimba: [[523.25, 0, 0.3, 'triangle', 1], [659.25, 0.12, 0.3, 'triangle', 1], [783.99, 0.24, 0.3, 'triangle', 1], [1046.5, 0.36, 0.5, 'triangle', 1]],
	beep: [[880, 0, 0.12, 'square', 0.45], [880, 0.22, 0.12, 'square', 0.45], [880, 0.44, 0.12, 'square', 0.45]],
	alarm: [[988, 0, 0.16, 'square', 0.5], [740, 0.18, 0.16, 'square', 0.5], [988, 0.36, 0.16, 'square', 0.5], [740, 0.54, 0.16, 'square', 0.5], [988, 0.72, 0.16, 'square', 0.5], [740, 0.9, 0.2, 'square', 0.5]],
};

/** Loudest note peak at volume 100. Kept under 1 so stacked notes can't clip. */
const MAX_PEAK = 0.9;

/**
 * Play one of the preset alert sounds at `volume` (0–100; 0 is silent). Synthesized
 * rather than shipped as an audio asset so the plugin stays three files. Each call
 * makes its own short-lived context and closes it, so nothing stays open between
 * phases.
 */
export function playAlertSound(sound: PomodoroAlertSound, volume: number): void {
	const peak = Math.max(0, Math.min(100, volume)) / 100 * MAX_PEAK;
	if (peak <= 0) return;
	const Ctor = (globalThis as { AudioContext?: AudioContextCtor }).AudioContext;
	if (!Ctor) return;
	try {
		const ctx = new Ctor();
		const notes = SOUNDS[sound];
		let end = 0;
		for (const [freq, at, dur, wave, level] of notes) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = wave;
			osc.frequency.value = freq;
			const start = ctx.currentTime + at;
			gain.gain.setValueAtTime(0.0001, start);
			gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * level), start + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
			osc.connect(gain).connect(ctx.destination);
			osc.start(start);
			osc.stop(start + dur + 0.03);
			end = Math.max(end, at + dur + 0.03);
		}
		setTimeout(() => void ctx.close(), (end + 0.5) * 1000);
	} catch {
		// Audio is a nicety — never let it break the timer.
	}
}

/** Short double buzz where the runtime supports it (Android); a no-op elsewhere, including iOS. */
export function vibrate(): void {
	try {
		(globalThis as { navigator?: Navigator }).navigator?.vibrate?.([200, 100, 200]);
	} catch {
		// Not supported — ignore.
	}
}

/** What happened to a notification request — surfaced by the settings test button. */
export type SystemNotificationResult = 'shown' | 'unsupported' | 'denied' | 'error';

/**
 * Raise an OS-level notification via the Web Notification API (Electron routes
 * it to the system notification centre). Clicking it runs `onClick` — main uses
 * that to focus the window and reveal the Pomodoro pane. 'shown' means the
 * runtime accepted it; the OS can still suppress it (Windows Focus Assist /
 * per-app notification settings, macOS Focus), which no API reports.
 */
export async function showSystemNotification(title: string, body: string, onClick?: () => void): Promise<SystemNotificationResult> {
	const Api = (globalThis as { Notification?: typeof Notification }).Notification;
	if (!Api) return 'unsupported';
	try {
		if (Api.permission === 'default') await Api.requestPermission();
		if (Api.permission !== 'granted') return 'denied';
		const n = new Api(title, { body, silent: true });
		if (onClick) n.onclick = () => { onClick(); n.close(); };
		return 'shown';
	} catch {
		return 'error';
	}
}

/** One-line, user-facing explanation of a test-notification result. */
export function describeNotificationResult(result: SystemNotificationResult): string {
	switch (result) {
		case 'shown':
			return 'Test notification sent. If nothing appeared, your OS is hiding it — on Windows check Focus Assist / Do Not Disturb and Settings → System → Notifications → Obsidian.';
		case 'denied':
			return 'Notifications are blocked for Obsidian (permission denied).';
		case 'unsupported':
			return 'This device has no notification API — only the in-app notice and chime are available.';
		case 'error':
			return 'The notification could not be created. See the developer console for details.';
	}
}
