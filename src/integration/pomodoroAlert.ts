// Attention cues for a Pomodoro phase boundary: a short synthesized chime and a
// desktop OS notification. NO Obsidian imports — enforced by
// architectureBoundaries.test.ts. main.ts decides *whether* to fire each (the
// settings + Platform gate); this only knows *how*, and fails silently where the
// runtime lacks the API (mobile WebViews, tests).

import { SOUNDS, type PomodoroAlertSound } from './pomodoroSounds';

type AudioContextCtor = new () => AudioContext;

/** Loudest note peak at volume 100. Kept under 1 so stacked notes can't clip. */
const MAX_PEAK = 0.9;

function peakFor(volume: number): number {
	return Math.max(0, Math.min(100, volume)) / 100 * MAX_PEAK;
}

function audioContextCtor(): AudioContextCtor | undefined {
	return (globalThis as { AudioContext?: AudioContextCtor }).AudioContext;
}

/**
 * Queue a preset's notes on `ctx` starting at audio-clock time `start`. Returns
 * the oscillators (so a future cue can be cancelled) and when the last one ends.
 */
function scheduleNotes(ctx: AudioContext, sound: PomodoroAlertSound, peak: number, start: number): { oscillators: OscillatorNode[]; end: number } {
	const oscillators: OscillatorNode[] = [];
	let end = start;
	for (const [freq, at, dur, wave, level] of SOUNDS[sound]) {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = wave;
		osc.frequency.value = freq;
		const t = start + at;
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * level), t + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		osc.connect(gain).connect(ctx.destination);
		osc.start(t);
		osc.stop(t + dur + 0.03);
		oscillators.push(osc);
		end = Math.max(end, t + dur + 0.03);
	}
	return { oscillators, end };
}

/**
 * Play one of the preset alert sounds at `volume` (0–100; 0 is silent). Synthesized
 * rather than shipped as an audio asset so the plugin stays three files. Each call
 * makes its own short-lived context and closes it, so nothing stays open between
 * phases. Used for previews and as the fallback when a scheduled `PhaseCueAudio`
 * cue didn't sound.
 */
export function playAlertSound(sound: PomodoroAlertSound, volume: number): void {
	const peak = peakFor(volume);
	if (peak <= 0) return;
	const Ctor = audioContextCtor();
	if (!Ctor) return;
	try {
		const ctx = new Ctor();
		const { end } = scheduleNotes(ctx, sound, peak, ctx.currentTime);
		setTimeout(() => void ctx.close(), (end - ctx.currentTime + 0.5) * 1000);
	} catch {
		// Audio is a nicety — never let it break the timer.
	}
}

/**
 * A cue counts as played once the audio clock is within this many seconds of its
 * start: it is sounding, done, or about to sound — so neither cancel it nor play
 * it again. Absorbs the small lag between the audio clock and `Date.now()`.
 */
const CUE_DUE_SLACK_SEC = 1;

interface ScheduledCue {
	key: string;
	startsAt: number;
	oscillators: OscillatorNode[];
}

/**
 * The phase-end chime, scheduled ahead of time on one long-lived AudioContext.
 *
 * Why: a backgrounded window throttles `setInterval` (Chromium aligns hidden
 * timers to once a minute), so a chime played from the tick lands late or — in a
 * context created while hidden — not at all. Notes queued on the audio clock run
 * on the audio thread, which isn't throttled, so the cue sounds at the phase end
 * whether or not the window is in front. The context is opened from the first
 * `schedule()` call, which happens synchronously inside the user's Start/Resume
 * click, so autoplay policy lets it run.
 *
 * Each cue has a `key` (see `phaseCueKey`) so the late tick can ask `hasPlayed`
 * and skip the fallback chime instead of doubling it.
 */
export class PhaseCueAudio {
	private ctx: AudioContext | null = null;
	private pending: ScheduledCue | null = null;
	private lastPlayedKey: string | null = null;
	private releaseTimer: ReturnType<typeof setTimeout> | null = null;

	/** Queue `sound` to start `delaySec` from now. Re-scheduling the same key is a no-op. */
	schedule(key: string, sound: PomodoroAlertSound, volume: number, delaySec: number): void {
		if (this.pending?.key === key) return;
		this.cancel();
		const peak = peakFor(volume);
		if (peak <= 0) return;
		const ctx = this.open();
		if (!ctx) return;
		try {
			const startsAt = ctx.currentTime + Math.max(0, delaySec);
			this.pending = { key, startsAt, oscillators: scheduleNotes(ctx, sound, peak, startsAt).oscillators };
		} catch {
			// Audio is a nicety — never let it break the timer.
		}
	}

	/** Drop the queued cue (pause, skip, stop). A cue that is already due is left to finish. */
	cancel(): void {
		const cue = this.pending;
		if (!cue) return;
		this.pending = null;
		if (this.isDue(cue)) {
			this.lastPlayedKey = cue.key;
			return;
		}
		for (const osc of cue.oscillators) {
			try {
				osc.stop();
				osc.disconnect();
			} catch {
				// Already stopped — ignore.
			}
		}
	}

	/** True once the cue for `key` has sounded (or is sounding) on the audio clock. */
	hasPlayed(key: string): boolean {
		if (this.lastPlayedKey === key) return true;
		return this.pending?.key === key && this.isDue(this.pending);
	}

	/**
	 * Session over: cancel, then close the context after a grace period so a cue
	 * that is sounding right now isn't cut off. A `schedule()` before then keeps it.
	 */
	release(): void {
		this.cancel();
		if (!this.ctx || this.releaseTimer !== null) return;
		this.releaseTimer = setTimeout(() => {
			this.releaseTimer = null;
			if (!this.pending) this.close();
		}, 5000);
	}

	/** Close immediately (plugin unload). */
	close(): void {
		this.cancel();
		if (this.releaseTimer !== null) {
			clearTimeout(this.releaseTimer);
			this.releaseTimer = null;
		}
		const ctx = this.ctx;
		this.ctx = null;
		if (ctx) void ctx.close().catch(() => undefined);
	}

	private open(): AudioContext | null {
		if (this.releaseTimer !== null) {
			clearTimeout(this.releaseTimer);
			this.releaseTimer = null;
		}
		if (!this.ctx) {
			const Ctor = audioContextCtor();
			if (!Ctor) return null;
			try {
				this.ctx = new Ctor();
			} catch {
				return null;
			}
		}
		if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
		return this.ctx;
	}

	private isDue(cue: ScheduledCue): boolean {
		return this.ctx !== null && this.ctx.state === 'running' && this.ctx.currentTime >= cue.startsAt - CUE_DUE_SLACK_SEC;
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
 * `silent: false` lets the OS play its own notification sound — the fallback
 * when our chime couldn't be confirmed.
 */
export async function showSystemNotification(title: string, body: string, onClick?: () => void, silent = true): Promise<SystemNotificationResult> {
	const Api = (globalThis as { Notification?: typeof Notification }).Notification;
	if (!Api) return 'unsupported';
	try {
		if (Api.permission === 'default') await Api.requestPermission();
		if (Api.permission !== 'granted') return 'denied';
		const n = new Api(title, { body, silent });
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
