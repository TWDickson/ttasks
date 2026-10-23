// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import TaskArchiveView from './TaskArchiveView.svelte';
import type { ArchivedTaskSummary } from '../store/ArchiveService';

function summary(overrides: Partial<ArchivedTaskSummary> = {}): ArchivedTaskSummary {
	return {
		path: 'Planner/Archive/2026/05/aaa111-old.md',
		id: 'aaa111',
		name: 'Old task',
		status: 'Done',
		completed: '2026-05-10',
		area: 'Work',
		archiveYear: '2026',
		archiveMonth: '5',
		...overrides,
	};
}

const MAY = summary();
const JUNE = summary({ path: 'Planner/Archive/2026/06/bbb222-newer.md', id: 'bbb222', name: 'Newer task', archiveMonth: '6', area: null });

describe('TaskArchiveView.svelte', () => {
	it('loads archived tasks and groups them by month, newest first', async () => {
		const loadArchived = vi.fn(async () => [MAY, JUNE]);
		render(TaskArchiveView, { props: { loadArchived, restoreArchived: vi.fn() } });

		await waitFor(() => expect(screen.getByText('2 tasks')).toBeTruthy());
		const headings = screen.getAllByRole('heading').map((h) => h.textContent?.replace(/\s+/g, ' ').trim());
		expect(headings).toEqual(['June 2026 1', 'May 2026 1']);
	});

	it('filters by search and says so when nothing matches', async () => {
		render(TaskArchiveView, { props: { loadArchived: async () => [MAY, JUNE], restoreArchived: vi.fn() } });
		await waitFor(() => expect(screen.getByText('Old task')).toBeTruthy());

		const search = screen.getByPlaceholderText('Search archive…');
		await fireEvent.input(search, { target: { value: 'newer' } });
		expect(screen.queryByText('Old task')).toBeNull();
		expect(screen.getByText('Newer task')).toBeTruthy();

		await fireEvent.input(search, { target: { value: 'zzz' } });
		expect(screen.getByText('No archived tasks match your search.')).toBeTruthy();
	});

	it('restores through the callback, then reloads the list', async () => {
		const loadArchived = vi.fn()
			.mockResolvedValueOnce([MAY])
			.mockResolvedValueOnce([]);
		const restoreArchived = vi.fn(async () => {});
		render(TaskArchiveView, { props: { loadArchived, restoreArchived } });
		await waitFor(() => expect(screen.getByText('Old task')).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

		expect(restoreArchived).toHaveBeenCalledWith(MAY.path);
		await waitFor(() => expect(screen.getByText('No archived tasks yet.')).toBeTruthy());
		expect(loadArchived).toHaveBeenCalledTimes(2);
	});
});
