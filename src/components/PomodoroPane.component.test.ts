// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import PomodoroPane from './PomodoroPane.svelte';
import type { PomodoroSession } from '../integration/pomodoro';

function activeSession(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
	return {
		taskPath: null,
		taskName: null,
		mode: 'focus',
		durationSec: 1500,
		remainingSec: 1499,
		running: true,
		completedFocus: 0,
		targetEndMs: null,
		isFill: false,
		...overrides,
	};
}

function renderPane(session: PomodoroSession | null) {
	const handlers = {
		onStart: vi.fn(),
		onFocusUntil: vi.fn(),
		onToggle: vi.fn(),
		onSkip: vi.fn(),
		onStop: vi.fn(),
		onOpenTask: vi.fn(),
	};
	render(PomodoroPane, {
		props: { session: writable(session), focusMinutes: 25, ...handlers },
	});
	return handlers;
}

describe('PomodoroPane', () => {
	it('shows the idle state with start controls when no session runs', () => {
		const h = renderPane(null);
		expect(screen.getByText('25:00')).toBeTruthy();
		expect(screen.getByText('No focus session running.')).toBeTruthy();
		fireEvent.click(screen.getByText('Start focus'));
		expect(h.onStart).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByText('Focus until…'));
		expect(h.onFocusUntil).toHaveBeenCalledOnce();
	});

	it('renders the live dial and controls for an active untethered session', () => {
		const h = renderPane(activeSession({ remainingSec: 305 }));
		expect(screen.getByText('05:05')).toBeTruthy();
		expect(screen.getByText('Untethered session')).toBeTruthy();
		fireEvent.click(screen.getByText('Pause'));
		expect(h.onToggle).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByText('Stop'));
		expect(h.onStop).toHaveBeenCalledOnce();
	});

	it('shows Resume while paused', () => {
		renderPane(activeSession({ running: false }));
		expect(screen.getByText('Resume')).toBeTruthy();
	});

	it('opens the focused task when its name is clicked', () => {
		const h = renderPane(activeSession({ taskPath: 'Tasks/a.md', taskName: 'Write report' }));
		fireEvent.click(screen.getByText('Write report'));
		expect(h.onOpenTask).toHaveBeenCalledWith('Tasks/a.md');
	});

	it('marks a focus-until session and its final fill focus', () => {
		renderPane(activeSession({ targetEndMs: Date.now() + 60_000, isFill: true }));
		expect(screen.getByText('Running until your target time')).toBeTruthy();
		expect(screen.getByText(/final/)).toBeTruthy();
	});
});
