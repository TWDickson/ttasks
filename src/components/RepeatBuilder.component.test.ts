// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import RepeatBuilder from './RepeatBuilder.svelte';
import type { RepeatRule } from '../repeat/types';

function renderBuilder(rule: RepeatRule | null, dueDate: string | null = '2026-10-13') {
	const onSave = vi.fn();
	const onCancel = vi.fn();
	render(RepeatBuilder, { props: { rule, dueDate, today: '2026-10-13', onSave, onCancel } });
	return { onSave, onCancel };
}

describe('RepeatBuilder', () => {
	it('starts a new rule as weekly on the due date\'s weekday and saves it', async () => {
		const { onSave } = renderBuilder(null);
		expect(screen.getByRole('button', { name: 'Tuesday' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByText('Every week on Tue')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Save repeat' }));
		expect(onSave).toHaveBeenCalledWith({ every: 1, unit: 'week', weekdays: ['tue'] });
	});

	it('builds "every 2 weeks on Mon and Wed"', async () => {
		const { onSave } = renderBuilder(null);
		await fireEvent.input(screen.getByLabelText('Repeat interval'), { target: { value: '2' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Tuesday' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Wednesday' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save repeat' }));
		expect(onSave).toHaveBeenCalledWith({ every: 2, unit: 'week', weekdays: ['mon', 'wed'] });
	});

	it('builds "first working day of every month, 12 times" and previews it', async () => {
		const { onSave } = renderBuilder(null);
		await fireEvent.change(screen.getByLabelText('Repeat unit'), { target: { value: 'month' } });
		await fireEvent.change(screen.getByLabelText('Which day'), { target: { value: 'nth' } });
		await fireEvent.change(screen.getByLabelText('Which occurrence'), { target: { value: '1' } });
		await fireEvent.change(screen.getByLabelText('Day kind'), { target: { value: 'working-day' } });
		await fireEvent.change(screen.getByLabelText('Ends'), { target: { value: 'count' } });
		await fireEvent.input(screen.getByLabelText('Number of times'), { target: { value: '12' } });
		expect(screen.getByText(/^Next: /)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Save repeat' }));
		expect(onSave).toHaveBeenCalledWith({ every: 1, unit: 'month', nth: { n: 1, target: 'working-day' }, count: 12 });
	});

	it('opens on an existing custom rule', () => {
		renderBuilder({ every: 1, unit: 'month', monthday: 'last', roll: 'previous' });
		expect((screen.getByLabelText('Which day') as HTMLSelectElement).value).toBe('last');
		expect((screen.getByLabelText('On a non-working day') as HTMLSelectElement).value).toBe('previous');
	});

	it('shows the problem and disables Save for an invalid rule', async () => {
		const { onSave } = renderBuilder(null);
		await fireEvent.input(screen.getByLabelText('Repeat interval'), { target: { value: '0' } });
		const save = screen.getByRole('button', { name: 'Save repeat' }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);
		expect(screen.getByText(/at least 1/)).toBeTruthy();
		await fireEvent.click(save);
		expect(onSave).not.toHaveBeenCalled();
	});

	it('cancel calls back without saving', async () => {
		const { onSave, onCancel } = renderBuilder(null);
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onCancel).toHaveBeenCalled();
		expect(onSave).not.toHaveBeenCalled();
	});
});
