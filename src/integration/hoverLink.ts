export function pathToLinktext(path: string): string {
	return path.endsWith('.md') ? path.slice(0, -3) : path;
}
