export type IdFactory = () => string;

function defaultIdFactory(): string {
	return Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}

export function slugifyTaskName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-{2,}/g, '-')
		.substring(0, 30)
		.replace(/-+$/, '') || 'task';
}

export function getUniqueTaskPath(
	folderPath: string,
	name: string,
	exists: (pathWithExt: string) => boolean,
	maxAttempts = 64,
	idFactory: IdFactory = defaultIdFactory
): { shortId: string; slug: string; filePath: string } | null {
	const slug = slugifyTaskName(name);

	for (let i = 0; i < maxAttempts; i++) {
		const shortId = idFactory();
		const filePath = `${folderPath}/${shortId}-${slug}.md`;
		if (!exists(filePath)) {
			return { shortId, slug, filePath };
		}
	}

	return null;
}

export function sanitizeDependsOnPaths(
	dependsOn: string[],
	selfPathWithExt: string,
	exists: (pathWithoutExt: string) => boolean
): string[] {
	const deduped = new Set<string>();
	const selfPath = selfPathWithExt.replace(/\.md$/, '');

	for (const raw of dependsOn) {
		const clean = String(raw ?? '').trim().replace(/\\/g, '/').replace(/\.md$/, '');
		if (!clean) continue;
		if (clean === selfPath) continue;
		if (!exists(clean)) continue;
		deduped.add(clean);
	}

	return [...deduped];
}
