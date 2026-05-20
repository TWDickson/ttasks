export function withCurrentOption(options: string[], current: string | null | undefined): string[] {
	if (!current) return options;
	if (options.includes(current)) return options;
	return [...options, current];
}
