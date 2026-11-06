// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import GraphProjectFilter from './GraphProjectFilter.svelte';
import type { Task } from '../../types';

const project = (path: string, name: string) => ({ path, name, type: 'project' }) as unknown as Task;

function renderFilter(hidden: string[] = []) {
	const onToggle = vi.fn();
	const onShowAll = vi.fn();
	render(GraphProjectFilter, {
		props: {
			projects: [project('P/a.md', 'Alpha'), project('P/b.md', 'Beta')],
			hiddenProjectPaths: new Set(hidden),
			onToggle,
			onShowAll,
		},
	});
	return { onToggle, onShowAll, pill: screen.getByRole('button', { name: /projects/i }) };
}

describe('GraphProjectFilter.svelte', () => {
	it('summarises the hidden count on the pill', () => {
		const { pill } = renderFilter(['P/b.md']);
		expect(pill).toHaveTextContent('1 hidden');
	});

	it('reads "All" when nothing is hidden', () => {
		expect(renderFilter().pill).toHaveTextContent('All');
	});

	it('opens a menu of projects, toggles one, and closes on a click outside', async () => {
		const { pill, onToggle } = renderFilter();
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();

		await fireEvent.click(pill);
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
		expect(onToggle).toHaveBeenCalledWith('P/b.md');

		await fireEvent.pointerDown(document.body);
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});

	it('closes on Escape', async () => {
		const { pill } = renderFilter();
		await fireEvent.click(pill);

		await fireEvent.keyDown(document.body, { key: 'Escape' });

		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});

	it('offers Show all only while something is hidden', async () => {
		const { pill, onShowAll } = renderFilter(['P/a.md']);
		await fireEvent.click(pill);

		await fireEvent.click(screen.getByRole('button', { name: 'Show all' }));

		expect(onShowAll).toHaveBeenCalled();
	});
});
