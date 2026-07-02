import { describe, expect, it } from 'vitest';
import { createManagedListItem, getRenameMappings, normalizeManagedListValues, resolveAreaOptions } from './managedListUtils';

describe('resolveAreaOptions', () => {
	it('returns settings areas as managed in settings order with no unmanaged for clean data', () => {
		const result = resolveAreaOptions(['Work', 'Home', 'Errands'], ['Home', 'Work']);
		expect(result.managed).toEqual(['Work', 'Home', 'Errands']);
		expect(result.unmanaged).toEqual([]);
	});

	it('surfaces observed areas not in settings as sorted, de-duplicated unmanaged values', () => {
		const result = resolveAreaOptions(['Work'], ['Work', 'Legacy', 'Zeta', 'Legacy', 'Alpha']);
		expect(result.managed).toEqual(['Work']);
		expect(result.unmanaged).toEqual(['Alpha', 'Legacy', 'Zeta']);
	});

	it('ignores empty observed values', () => {
		const result = resolveAreaOptions(['Work'], ['', 'Stray']);
		expect(result.unmanaged).toEqual(['Stray']);
	});
});

describe('createManagedListItem', () => {
	it('keeps originalValue defaulting to value', () => {
		const item = createManagedListItem('Active', '#3b82f6');
		expect(item.value).toBe('Active');
		expect(item.originalValue).toBe('Active');
		expect(item.color).toBe('#3b82f6');
	});

	it('supports explicit null originalValue for new rows', () => {
		const item = createManagedListItem('', '#3b82f6', null);
		expect(item.originalValue).toBeNull();
	});
});

describe('normalizeManagedListValues', () => {
	it('returns trimmed values and color map', () => {
		const result = normalizeManagedListValues([
			createManagedListItem(' Active ', '#3b82f6'),
			createManagedListItem('Done', '#10b981'),
		]);
		expect(result.error).toBeUndefined();
		expect(result.values).toEqual(['Active', 'Done']);
		expect(result.colors).toEqual({ Active: '#3b82f6', Done: '#10b981' });
	});

	it('returns error for blank items', () => {
		const result = normalizeManagedListValues([
			createManagedListItem('', '#3b82f6'),
		]);
		expect(result.error).toContain('blank');
	});

	it('returns error for duplicate values', () => {
		const result = normalizeManagedListValues([
			createManagedListItem('Done', '#10b981'),
			createManagedListItem('Done', '#10b981'),
		]);
		expect(result.error).toContain('Duplicate value');
	});
});

describe('getRenameMappings', () => {
	it('returns mapping only for changed non-empty original values', () => {
		const unchanged = createManagedListItem('Active', '#3b82f6');
		unchanged.value = 'Active';
		const renamed = createManagedListItem('In Progress', '#f59e0b');
		renamed.value = 'Doing';
		const newItem = createManagedListItem('', '#ef4444', null);
		newItem.value = 'Blocked';

		const result = getRenameMappings([unchanged, renamed, newItem]);
		expect(result).toEqual({ 'In Progress': 'Doing' });
	});
});
