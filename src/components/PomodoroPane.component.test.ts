// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { readable, writable } from 'svelte/store';
import PomodoroPane from './PomodoroPane.svelte';
import type { PomodoroSession } from '../integration/pomodoro';
import type { PomodoroDialStyle } from '../settings/types';

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

function renderPane(
	session: PomodoroSession | null,
	dialStyle: PomodoroDialStyle = 'digital',
	pickedTask: { path: string; name: string } | null = null,
) {
	const handlers = {
		onStart: vi.fn(),
		onFocusUntil: vi.fn(),
		onToggle: vi.fn(),
		onSkip: vi.fn(),
		onStop: vi.fn(),
		onOpenTask: vi.fn(),
		onOpenSettings: vi.fn(),
		onPickTask: vi.fn(),
		onClearPickedTask: vi.fn(),
	};
	render(PomodoroPane, {
		props: {
			session: writable(session),
			focusMinutes: 25,
			dialStyle: readable(dialStyle),
			pickedTask: readable(pickedTask),
			...handlers,
		},
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

	it('opens Pomodoro settings when the settings button is clicked', () => {
		const h = renderPane(null);
		fireEvent.click(screen.getByRole('button', { name: 'Pomodoro settings' }));
		expect(h.onOpenSettings).toHaveBeenCalledOnce();
	});

	it('renders no ring in digital mode', () => {
		const { container } = render(PomodoroPane, {
			props: {
				session: writable(activeSession()),
				focusMinutes: 25,
				dialStyle: readable('digital'),
				pickedTask: readable(null),
				onStart: vi.fn(), onFocusUntil: vi.fn(), onToggle: vi.fn(), onSkip: vi.fn(), onStop: vi.fn(),
				onOpenTask: vi.fn(), onOpenSettings: vi.fn(), onPickTask: vi.fn(), onClearPickedTask: vi.fn(),
			},
		});
		expect(container.querySelector('.tt-pomo-ring')).toBeNull();
	});

	it('renders the ring alongside MM:SS in ring mode', () => {
		renderPane(activeSession({ remainingSec: 750 }), 'ring');
		expect(screen.getByText('12:30')).toBeTruthy();
		expect(document.querySelector('.tt-pomo-ring-progress')).toBeTruthy();
	});

	it('renders only the ring with no digits in ring-plain (ADHD-friendly) mode', () => {
		renderPane(activeSession({ remainingSec: 750 }), 'ring-plain');
		expect(screen.queryByText('12:30')).toBeNull();
		expect(document.querySelector('.tt-pomo-ring-progress')).toBeTruthy();
	});

	it('opens the task picker from idle when no task is chosen', () => {
		const h = renderPane(null);
		expect(screen.queryByText('Untethered session')).toBeNull();
		fireEvent.click(screen.getByText('Choose a task…'));
		expect(h.onPickTask).toHaveBeenCalledOnce();
	});

	it('shows a chip for the chosen task with a clear control', () => {
		const h = renderPane(null, 'digital', { path: 'Tasks/a.md', name: 'Write report' });
		expect(screen.getByText('Write report')).toBeTruthy();
		expect(screen.queryByText('Choose a task…')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Clear chosen task' }));
		expect(h.onClearPickedTask).toHaveBeenCalledOnce();
	});
});
