export interface ManagedListItem {
	id: number;
	originalValue: string | null;
	value: string;
	color: string;
}

let nextManagedListItemId = 1;

export function createManagedListItem(
	value: string,
	color: string,
	originalValue: string | null = value,
): ManagedListItem {
	return {
		id: nextManagedListItemId++,
		originalValue,
		value,
		color,
	};
}

export function normalizeManagedListValues(
	items: ManagedListItem[],
	requireOne = false,
): { values: string[]; colors: Record<string, string>; error?: string } {
	const values: string[] = [];
	const colors: Record<string, string> = {};
	const seen = new Set<string>();

	for (const item of items) {
		const value = item.value.trim();
		if (!value) {
			return { values: [], colors: {}, error: 'Remove blank items or give them a value before saving.' };
		}
		if (seen.has(value)) {
			return { values: [], colors: {}, error: `Duplicate value: ${value}` };
		}
		seen.add(value);
		values.push(value);
		if (item.color) {
			colors[value] = item.color;
		}
	}

	if (requireOne && values.length === 0) {
		return { values: [], colors: {}, error: 'At least one item is required.' };
	}

	return { values, colors };
}

export function getRenameMappings(items: ManagedListItem[]): Record<string, string> {
	const mappings: Record<string, string> = {};
	for (const item of items) {
		const nextValue = item.value.trim();
		if (!item.originalValue || !nextValue) continue;
		if (item.originalValue !== nextValue) {
			mappings[item.originalValue] = nextValue;
		}
	}
	return mappings;
}

export interface ResolvedManagedOptions {
	/** Configured values, in settings order — the source of truth. */
	managed: string[];
	/** Observed values not present in settings, de-duplicated and sorted. */
	unmanaged: string[];
}

/**
 * Reconciles the configured `settings.areas` list with the areas observed on
 * tasks. `managed` is the settings list verbatim; `unmanaged` is any observed
 * area not in settings — stray/legacy frontmatter values — de-duplicated and
 * sorted alphabetically, surfaced as a migration safety net.
 */
export function resolveAreaOptions(settingsAreas: string[], observedAreas: string[]): ResolvedManagedOptions {
	const managed = [...settingsAreas];
	const managedSet = new Set(settingsAreas);
	const unmanaged = [...new Set(observedAreas.filter((area) => !!area && !managedSet.has(area)))].sort();
	return { managed, unmanaged };
}
