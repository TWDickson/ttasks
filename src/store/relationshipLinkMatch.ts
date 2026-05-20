import { ensureMdExt, stripMdExt } from '../utils/pathUtils';
import { parseWikiLink } from '../utils/wikiLink';

export interface LinkMatchInput {
	rawValue: unknown;
	targetPathWithoutExt: string;
	sourcePath: string;
	resolveLinkpathDest: (linkpath: string, sourcePath: string) => string | null;
}

function normalizeCleanPath(pathWithoutExt: string): string {
	return stripMdExt(pathWithoutExt).replace(/\\/g, '/').trim();
}

function basename(pathWithoutExt: string): string {
	const normalized = normalizeCleanPath(pathWithoutExt);
	const lastSlash = normalized.lastIndexOf('/');
	return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/**
 * Returns true when a stored wikilink value points to the requested target path.
 *
 * Primary strategy is metadata-backed path resolution. If resolution is unavailable,
 * fall back to exact clean-path match and then basename match for same-folder links.
 */
export function linkReferencesTaskPath(input: LinkMatchInput): boolean {
	const { rawValue, targetPathWithoutExt, sourcePath, resolveLinkpathDest } = input;
	const linkpath = parseWikiLink(rawValue);
	if (!linkpath) return false;

	const targetClean = normalizeCleanPath(targetPathWithoutExt);
	if (!targetClean) return false;

	const resolved = resolveLinkpathDest(linkpath, sourcePath);
	if (resolved) {
		return normalizeCleanPath(resolved) === targetClean;
	}

	const linkClean = normalizeCleanPath(ensureMdExt(linkpath));
	if (linkClean === targetClean) return true;

	return basename(linkClean) === basename(targetClean);
}
