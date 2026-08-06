export interface BuildAliasedLinkOptions<TFileLike> {
	targetPathWithoutExt: string;
	/**
	 * The human name to display. Pass `null` when the target's name can't be
	 * resolved — we then write a bare `[[path]]` rather than inventing an alias
	 * from the filename, which would persist a fake title into the vault and
	 * make a dangling link indistinguishable from a healthy one.
	 */
	alias: string | null;
	sourcePath: string;
	resolveFile: (normalizedPath: string) => TFileLike | null;
	generateMarkdownLink?: (file: TFileLike, sourcePath: string, subpath?: string, alias?: string) => string;
}

export function buildAliasedLink<TFileLike>(options: BuildAliasedLinkOptions<TFileLike>): string {
	const targetPathWithoutExt = options.targetPathWithoutExt.replace(/\\.md$/, '');
	const targetPath = `${targetPathWithoutExt}.md`;
	const alias = options.alias?.trim() ? options.alias : null;
	const file = options.resolveFile(targetPath);
	if (file && options.generateMarkdownLink) {
		try {
			const generated = options.generateMarkdownLink(file, options.sourcePath, undefined, alias ?? undefined);
			if (typeof generated === 'string' && generated.trim().length > 0) {
				return generated;
			}
		} catch {
			// Fallback to explicit wikilink.
		}
	}
	return alias ? `[[${targetPathWithoutExt}|${alias}]]` : `[[${targetPathWithoutExt}]]`;
}
