export function mutateLinkArray(current: string[], add: string[], remove: string[]): string[] {
	const removeSet = new Set(remove);
	const kept = current.filter((value) => !removeSet.has(value));
	const seen = new Set<string>();
	const result: string[] = [];

	for (const value of kept) {
		if (seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}

	for (const value of add) {
		if (removeSet.has(value) || seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}

	return result;
}