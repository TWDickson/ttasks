// Attention cues for a Pomodoro phase boundary: a short synthesized chime and a
// desktop OS notification. NO Obsidian imports — enforced by
// architectureBoundaries.test.ts. main.ts decides *whether* to fire each (the
// settings + Platform gate); this only knows *how*, and fails silently where the
// runtime lacks the API (mobile WebViews, tests).

type AudioContextCtor = new () => AudioContext;

/**
 * Two soft sine notes (E5 → A5), ~0.6s total. Synthesized rather than shipped as
 * an audio asset so the plugin stays three files. Each call makes its own
 * short-lived context and closes it, so nothing stays open between phases.
 */
export function playChime(): void {
	const Ctor = (globalThis as { AudioContext?: AudioContextCtor }).AudioContext;
	if (!Ctor) return;
	try {
		const ctx = new Ctor();
		const notes: Array<[number, number]> = [[659.25, 0], [880, 0.18]];
		for (const [freq, at] of notes) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'sine';
			osc.frequency.value = freq;
			const start = ctx.currentTime + at;
			gain.gain.setValueAtTime(0.0001, start);
			gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
			osc.connect(gain).connect(ctx.destination);
			osc.start(start);
			osc.stop(start + 0.45);
		}
		setTimeout(() => void ctx.close(), 1000);
	} catch {
		// Audio is a nicety — never let it break the timer.
	}
}

/**
 * Raise an OS-level notification via the Web Notification API (Electron routes
 * it to the system notification centre). Clicking it runs `onClick` — main uses
 * that to focus the window and reveal the Pomodoro pane. Returns false when the
 * API is missing or permission was denied, so the caller knows nothing showed.
 */
export async function showSystemNotification(title: string, body: string, onClick?: () => void): Promise<boolean> {
	const Api = (globalThis as { Notification?: typeof Notification }).Notification;
	if (!Api) return false;
	try {
		if (Api.permission === 'default') await Api.requestPermission();
		if (Api.permission !== 'granted') return false;
		const n = new Api(title, { body, silent: true });
		if (onClick) n.onclick = () => { onClick(); n.close(); };
		return true;
	} catch {
		return false;
	}
}
