import { readable, type Readable } from 'svelte/store';
import { localDateString } from './dateUtils';

/**
 * A Svelte store holding today's local date (YYYY-MM-DD) that flips just after
 * midnight. One timer serves every subscriber, and it is cleaned up on the last
 * unsubscribe (Svelte `readable` starts on first subscriber, stops on last).
 *
 * Replaces the per-component `setTimeout` refresh blocks that TaskRow and
 * TaskKanban each carried — previously every TaskRow ran its own timer.
 */
export function createTodayStore(): Readable<string> {
	return readable(localDateString(), (set) => {
		let timer: ReturnType<typeof setTimeout>;
		const schedule = () => {
			const now = new Date();
			const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
			const ms = tomorrow.getTime() - now.getTime() + 100; // 100ms past midnight
			timer = setTimeout(() => {
				set(localDateString());
				schedule();
			}, ms);
		};
		schedule();
		return () => clearTimeout(timer);
	});
}

/** Shared singleton — consume via `$today` anywhere a live current date is needed. */
export const today = createTodayStore();
