// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import FilterDropdown from './FilterDropdown.svelte';

function renderDropdown(props: Partial<{
	label: string;
	options: string[];
	secondaryOptions: string[];
	selected: string[];
}> = {}) {
	const onChange = vi.fn();
	const { component } = render(FilterDropdown, {
		props: {
			label: 'Status',
			options: ['Active', 'Blocked', 'Hold'],
			secondaryOptions: [],
			selected: [],
			...props,
		},
	});
	component.$on('change', (event: CustomEvent<string[]>) => onChange(event.detail));
	return { onChange };
}

async function openMenu() {
	// The trigger's accessible name changes with the selection ("Filter by status"
	// vs "Status: Active"), and once open the menu adds a Clear button — so match
	// on position rather than on a name that moves.
	await fireEvent.click(screen.getAllByRole('button')[0]);
}

describe('FilterDropdown.svelte', () => {
	it('renders nothing when there are no options at all', () => {
		renderDropdown({ options: [], secondaryOptions: [] });

		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('shows the field label until exactly one value is picked', async () => {
		renderDropdown({ selected: ['Blocked'] });

		// One selection names itself — more useful than "Status 1".
		expect(screen.getByRole('button', { name: /status: blocked/i })).toHaveTextContent('Blocked');
	});

	it('falls back to the label plus a count for several selections', () => {
		renderDropdown({ selected: ['Blocked', 'Hold'] });

		const trigger = screen.getByRole('button', { name: /status: blocked, hold/i });
		expect(trigger).toHaveTextContent('Status');
		expect(trigger).toHaveTextContent('2');
	});

	it('keeps the menu closed until the trigger is clicked', async () => {
		renderDropdown();
		expect(screen.queryByRole('group')).not.toBeInTheDocument();

		await openMenu();

		expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument();
		expect(screen.getAllByRole('checkbox')).toHaveLength(3);
	});

	it('emits the value added to the selection', async () => {
		const { onChange } = renderDropdown({ selected: ['Active'] });
		await openMenu();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Blocked' }));

		expect(onChange).toHaveBeenCalledWith(['Active', 'Blocked']);
	});

	it('emits the value removed when an already-checked box is clicked', async () => {
		const { onChange } = renderDropdown({ selected: ['Active', 'Blocked'] });
		await openMenu();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Active' }));

		expect(onChange).toHaveBeenCalledWith(['Blocked']);
	});

	it('offers a clear action only while something is selected', async () => {
		const { onChange } = renderDropdown({ selected: ['Active'] });
		await openMenu();

		await fireEvent.click(screen.getByRole('button', { name: /clear status/i }));

		expect(onChange).toHaveBeenCalledWith([]);
	});

	it('hides the clear action when the selection is empty', async () => {
		renderDropdown({ selected: [] });
		await openMenu();

		expect(screen.queryByRole('button', { name: /clear status/i })).not.toBeInTheDocument();
	});

	it('lists unmanaged values below the managed ones', async () => {
		// Values that exist on tasks but not in settings — a task filed under a
		// since-deleted area is exactly the one you need to find.
		renderDropdown({ options: ['Active'], secondaryOptions: ['LegacyStatus'] });
		await openMenu();

		expect(screen.getByRole('checkbox', { name: 'LegacyStatus' })).toBeInTheDocument();
	});

	it('closes on Escape', async () => {
		renderDropdown();
		await openMenu();
		expect(screen.getByRole('group')).toBeInTheDocument();

		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(screen.queryByRole('group')).not.toBeInTheDocument();
	});

	it('closes on a click outside, but not on one inside', async () => {
		renderDropdown();
		await openMenu();

		await fireEvent.mouseDown(screen.getByRole('group'));
		expect(screen.getByRole('group')).toBeInTheDocument();

		await fireEvent.mouseDown(document.body);
		expect(screen.queryByRole('group')).not.toBeInTheDocument();
	});
});
