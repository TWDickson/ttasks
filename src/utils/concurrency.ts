export async function withConcurrencyLimit<T>(
	tasks: Array<() => Promise<T>>,
	limit: number,
): Promise<Array<T | undefined>> {
	if (tasks.length === 0) return [];
	const maxConcurrent = Math.max(1, Math.floor(limit));
	const results: Array<T | undefined> = new Array(tasks.length).fill(undefined);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		for (;;) {
			const currentIndex = nextIndex++;
			if (currentIndex >= tasks.length) return;
			try {
				results[currentIndex] = await tasks[currentIndex]();
			} catch {
				results[currentIndex] = undefined;
			}
		}
	}

	const workers = Array.from({ length: Math.min(maxConcurrent, tasks.length) }, () => worker());
	await Promise.all(workers);
	return results;
}