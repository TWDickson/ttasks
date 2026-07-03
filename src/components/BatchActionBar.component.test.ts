// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import BatchActionBar from './BatchActionBar.svelte';

function renderBar(eligibility: { canArchive: boolean; canComplete: boolean; canDelete: boolean }) {
	const onArchive = vi.fn(async () => {});
	const onComplete = vi.fn(async () => {});
	const onDelete = vi.fn(async () => {});
	const onClear = vi.fn();

	render(BatchActionBar, {
		props: {
			selectedCount: 3,
			eligibility,
			onArchive,
			onComplete,
			onDelete,
			onClear,
		},
	});

	return { onArchive, onComplete, onDelete, onClear };
}

describe('BatchActionBar.svelte', () => {
	it('renders selected count label', () => {
		renderBar({ canArchive: false, canComplete: false, canDelete: true });
		expect(screen.getByText('3 selected')).toBeInTheDocument();
	});

	it('shows Complete button when canComplete is true', () => {
		renderBar({ canArchive: false, canComplete: true, canDelete: true });
		expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
	});

	it('hides Complete button when canComplete is false', () => {
		renderBar({ canArchive: false, canComplete: false, canDelete: true });
		expect(screen.queryByRole('button', { name: 'Complete' })).toBeNull();
	});

	it('shows Archive button when canArchive is true', () => {
		renderBar({ canArchive: true, canComplete: false, canDelete: true });
		expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
	});

	it('hides Archive button when canArchive is false', () => {
		renderBar({ canArchive: false, canComplete: false, canDelete: true });
		expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
	});

	it('shows Delete button when canDelete is true', () => {
		renderBar({ canArchive: false, canComplete: false, canDelete: true });
		expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
	});

	it('calls onComplete when Complete clicked', async () => {
		const { onComplete } = renderBar({ canArchive: false, canComplete: true, canDelete: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it('calls onArchive when Archive clicked', async () => {
		const { onArchive } = renderBar({ canArchive: true, canComplete: false, canDelete: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
		expect(onArchive).toHaveBeenCalledTimes(1);
	});

	it('calls onDelete when Delete clicked', async () => {
		const { onDelete } = renderBar({ canArchive: false, canComplete: false, canDelete: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		expect(onDelete).toHaveBeenCalledTimes(1);
	});

	it('calls onClear when clear button clicked', async () => {
		const { onClear } = renderBar({ canArchive: false, canComplete: false, canDelete: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
		expect(onClear).toHaveBeenCalledTimes(1);
	});
});
