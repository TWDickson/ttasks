import { type Writable, get, writable } from 'svelte/store';
import {
	type PomodoroConfig,
	type PomodoroMode,
	type PomodoroSession,
	advancePhase,
	isPhaseComplete,
	nextMode,
	pauseSession,
	phaseDurationSec,
	resumeSession,
	shouldLogFocus,
	startSession,
	tickSession,
} from '../integration/pomodoro';
import { fillFocusMinutes, planFocusUntil } from '../integration/pomodoroPlan';

/**
 * Everything the service needs from the outside, injected so this file stays
 * free of Obsidian imports (enforced by architectureBoundaries.test.ts) and
 * unit-testable with fake timers. `getConfig` reads live settings each call so
 * a mid-session settings change applies on the next phase.
 */
export interface CompletedFocus {
	/** Task the session was focused on, or null when untethered. */
	taskPath: string | null;
	taskName: string | null;
	/** Whole minutes of focus to log. */
	minutes: number;
	mode: PomodoroMode;
}

export interface PomodoroServiceDeps {
	getConfig: () => PomodoroConfig & { autoStartNext: boolean };
	/**
	 * Persist a completed focus session: append it to the session log, and (when a
	 * task is attached) bump the task's count + minutes. Called once per finished
	 * focus phase.
	 */
	logFocus: (focus: CompletedFocus) => void | Promise<void>;
	/** Surface a short message (wired to Obsidian's Notice in main). */
	notify: (message: string) => void;
	/** Wall-clock source (epoch ms); injectable for tests. Defaults to Date.now. */
	now?: () => number;
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

	private now(): number {
		return this.deps.now ? this.deps.now() : Date.now();
	}

	/** Start (or restart) a focus session on a task, or untethered when path/name are null. */
	start(taskPath: string | null, taskName: string | null): void {
		const config = this.deps.getConfig();
		this.session.set(startSession(taskPath, taskName, config));
		this.deps.notify(`Pomodoro started — ${taskName ?? 'Focus'}`);
		this.ensureTicking();
	}

	/**
	 * Start a "focus until X" session: fill `availableMinutes` with Pomodoro phases
	 * that end cleanly before the target, so nothing runs past it. Returns false
	 * (without starting) when not even a one-minute focus fits. Optionally tied to a
	 * task, or untethered when path/name are null.
	 */
	startUntil(taskPath: string | null, taskName: string | null, availableMinutes: number): boolean {
		const config = this.deps.getConfig();
		const plan = planFocusUntil(availableMinutes, config);
		if (plan.phases.length === 0) {
			this.deps.notify('Not enough time before the target for a focus session.');
			return false;
		}
		const targetEndMs = this.now() + Math.floor(availableMinutes) * 60_000;
		const base = startSession(taskPath, taskName, config);
		const first = plan.phases[0];
		const durationSec = first.minutes * 60;
		this.session.set({ ...base, durationSec, remainingSec: durationSec, isFill: first.isFill, targetEndMs });
		const n = plan.focusCount;
		this.deps.notify(`Focus until target — ${n} focus session${n === 1 ? '' : 's'} planned (${taskName ?? 'Focus'})`);
		this.ensureTicking();
		return true;
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
			// Log the phase's actual length — a trailing fill focus is shorter than focusMinutes.
			const minutes = Math.round(completed.durationSec / 60);
			void this.deps.logFocus({
				taskPath: completed.taskPath,
				taskName: completed.taskName,
				minutes,
				mode: completed.mode,
			});
			const target = completed.taskName ? ` to ${completed.taskName}` : '';
			this.deps.notify(`Focus complete — logged ${minutes}m${target}`);
		}

		if (completed.targetEndMs !== null) {
			this.handleUntilBoundary(completed, config);
			return;
		}

		this.announcePhase(advancePhase(completed, config), config);
	}

	/** Start or arm `next`, honoring the auto-start setting, then publish it. */
	private announcePhase(next: PomodoroSession, config: PomodoroConfig & { autoStartNext: boolean }): void {
		const label = phaseLabel(next.mode);
		if (config.autoStartNext) {
			this.deps.notify(`${label} started`);
			this.session.set(next);
		} else {
			this.deps.notify(`${label} ready — resume when you are`);
			this.session.set(pauseSession(next));
		}
	}

	private finishAtTarget(): void {
		this.deps.notify('Reached your target time — nice work.');
		this.session.set(null);
		this.clearTicking();
	}

	/**
	 * Decide what runs next in a "focus until X" session. Runs the next full phase
	 * if it completes before the target; otherwise fills a leftover focus gap with a
	 * shortened final focus, or stops. A completed fill focus ends the session.
	 */
	private handleUntilBoundary(completed: PomodoroSession, config: PomodoroConfig & { autoStartNext: boolean }): void {
		if (completed.isFill) {
			this.finishAtTarget();
			return;
		}
		const remainingMs = Math.max(0, (completed.targetEndMs ?? 0) - this.now());
		const upcoming = nextMode(completed, config);
		const fullSec = phaseDurationSec(upcoming, config);

		if (remainingMs >= fullSec * 1000) {
			this.announcePhase(advancePhase(completed, config), config);
			return;
		}

		const fillMin = upcoming === 'focus' ? fillFocusMinutes(remainingMs / 60_000) : 0;
		if (fillMin >= 1) {
			const durationSec = fillMin * 60;
			const fill: PomodoroSession = {
				...completed,
				mode: 'focus',
				durationSec,
				remainingSec: durationSec,
				running: config.autoStartNext,
				isFill: true,
			};
			this.session.set(fill);
			this.deps.notify(`${fillMin}m until target — final focus ${config.autoStartNext ? 'started' : 'ready'}.`);
			return;
		}

		this.finishAtTarget();
	}
}
