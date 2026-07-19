import { type Writable, get, writable } from 'svelte/store';
import {
	type PomodoroConfig,
	type PomodoroSession,
	advancePhase,
	isPhaseComplete,
	pauseSession,
	resumeSession,
	shouldLogFocus,
	startSession,
	tickSession,
} from '../integration/pomodoro';

/**
 * Everything the service needs from the outside, injected so this file stays
 * free of Obsidian imports (enforced by architectureBoundaries.test.ts) and
 * unit-testable with fake timers. `getConfig` reads live settings each call so
 * a mid-session settings change applies on the next phase.
 */
export interface PomodoroServiceDeps {
	getConfig: () => PomodoroConfig & { autoStartNext: boolean };
	/** Persist a completed focus session against the task (count += 1, minutes += n). */
	logFocus: (taskPath: string, minutes: number) => void | Promise<void>;
	/** Surface a short message (wired to Obsidian's Notice in main). */
	notify: (message: string) => void;
}

function phaseLabel(mode: PomodoroSession['mode']): string {
	return mode === 'focus' ? 'Focus' : mode === 'short-break' ? 'Short break' : 'Long break';
}

/**
 * Owns the live Pomodoro session: a 1s interval tick, a reactive store the UI
 * subscribes to, focus-completion logging, and end-of-phase notifications. The
 * phase math lives in the pure `pomodoro` module; this only orchestrates timing,
 * persistence, and messaging.
 */
export class PomodoroService {
	readonly session: Writable<PomodoroSession | null> = writable(null);
	// Unqualified global timers (not window.*) so this resolves in both the
	// Obsidian runtime and the node test env; disposal is handled explicitly.
	private intervalId: ReturnType<typeof setInterval> | null = null;

	constructor(private readonly deps: PomodoroServiceDeps) {}

	/** Start (or restart) a focus session on a task. */
	start(taskPath: string, taskName: string): void {
		const config = this.deps.getConfig();
		this.session.set(startSession(taskPath, taskName, config));
		this.deps.notify(`Pomodoro started — ${taskName}`);
		this.ensureTicking();
	}

	pause(): void {
		this.session.update((s) => (s ? pauseSession(s) : s));
	}

	resume(): void {
		this.session.update((s) => (s ? resumeSession(s) : s));
		this.ensureTicking();
	}

	/** Play/pause toggle; no-op when idle. */
	toggle(): void {
		const s = get(this.session);
		if (!s) return;
		if (s.running) this.pause();
		else this.resume();
	}

	/** End the session entirely and clear the display. */
	stop(): void {
		if (get(this.session)) this.deps.notify('Pomodoro stopped');
		this.session.set(null);
		this.clearTicking();
	}

	/** Jump to the next phase now (no focus logging — a manual skip). */
	skip(): void {
		const s = get(this.session);
		if (!s) return;
		const config = this.deps.getConfig();
		let next = advancePhase({ ...s, remainingSec: 0 }, config);
		if (!config.autoStartNext) next = pauseSession(next);
		this.session.set(next);
		this.deps.notify(`Skipped to ${phaseLabel(next.mode).toLowerCase()}`);
		this.ensureTicking();
	}

	isActive(): boolean {
		return get(this.session) !== null;
	}

	dispose(): void {
		this.clearTicking();
		this.session.set(null);
	}

	private ensureTicking(): void {
		if (this.intervalId !== null) return;
		this.intervalId = setInterval(() => this.tick(), 1000);
	}

	private clearTicking(): void {
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	private tick(): void {
		const current = get(this.session);
		if (!current) {
			this.clearTicking();
			return;
		}
		if (!current.running) return; // paused — keep the interval but idle
		const ticked = tickSession(current, 1);
		if (isPhaseComplete(ticked)) this.onPhaseComplete(ticked);
		else this.session.set(ticked);
	}

	private onPhaseComplete(completed: PomodoroSession): void {
		const config = this.deps.getConfig();

		if (shouldLogFocus(completed)) {
			const minutes = config.focusMinutes;
			void this.deps.logFocus(completed.taskPath, minutes);
			this.deps.notify(`Focus complete — logged ${minutes}m to ${completed.taskName}`);
		}

		let next = advancePhase(completed, config);
		const label = phaseLabel(next.mode);
		if (config.autoStartNext) {
			this.deps.notify(`${label} started`);
		} else {
			next = pauseSession(next);
			this.deps.notify(`${label} ready — resume when you are`);
		}
		this.session.set(next);
	}
}
