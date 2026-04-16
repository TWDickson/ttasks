export interface BuildAliasedLinkOptions<TFileLike> {
	targetPathWithoutExt: string;
	alias: string;
	sourcePath: string;
	resolveFile: (normalizedPath: string) => TFileLike | null;
	generateMarkdownLink?: (file: TFileLike, sourcePath: string, subpath?: string, alias?: string) => string;
}

export function buildAliasedLink<TFileLike>(options: BuildAliasedLinkOptions<TFileLike>): string {
	const targetPathWithoutExt = options.targetPathWithoutExt.replace(/\\.md$/, '');
	const targetPath = `${targetPathWithoutExt}.md`;
	const file = options.resolveFile(targetPath);
	if (file && options.generateMarkdownLink) {
		try {
			const generated = options.generateMarkdownLink(file, options.sourcePath, undefined, options.alias);
			if (typeof generated === 'string' && generated.trim().length > 0) {
				return generated;
			}
		} catch {
			// Fallback to explicit aliased wikilink.
		}
	}
	return `[[${targetPathWithoutExt}|${options.alias}]]`;
}
