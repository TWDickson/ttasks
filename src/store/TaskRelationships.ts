import { fmKey } from '../schema/taskPersistence';
import { writeStoredField } from '../schema/taskCodec';
import { TFile, normalizePath } from 'obsidian';
import type TTasksPlugin from '../main';
import { parseWikiLink } from '../utils/wikiLink';
import { ensureMdExt, stripMdExt } from '../utils/pathUtils';
import { buildAliasedLink } from '../integration/relationshipLink';
import { withConcurrencyLimit } from '../utils/concurrency';

// ── Pure helpers (exported for testing) ─────────────────────────────────────

/**
 * Rewrites a single wiki-link string if it contains oldClean, replacing with newClean.
 */
export function rewriteWikiLinkValue(val: string, oldPattern: RegExp, newClean: string): string {
	return val.replace(oldPattern, (_match, alias) => `[[${newClean}${alias ?? ''}]]`);
}

/**
 * Filters a list of wiki-link values, removing any that resolve to deletedClean.
 */
export function filterOutDeletedPath(
	links: unknown[],
	deletedClean: string,
	parseFn: (v: unknown) => string | null
): unknown[] {
	return links.filter(v => parseFn(v) !== deletedClean);
}

// ── TaskRelationships class ──────────────────────────────────────────────────

export class TaskRelationships {
	constructor(private plugin: TTasksPlugin) {}

	private get app() { return this.plugin.app; }
	private get folderPath() { return normalizePath(this.plugin.settings.tasksFolder); }

	async rewriteRelationshipReferences(oldPath: string, newPath: string): Promise<void> {
		const oldClean = oldPath.replace(/\.md$/, '');
		const newClean = newPath.replace(/\.md$/, '');
		if (oldClean === newClean) return;

		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) return;

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md' && f.path !== newPath
		);

		const oldPattern = oldClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const linkRegex = new RegExp(`\\[\\[${oldPattern}(\\|[^\\]]+)?\\]\\]`, 'g');

		await withConcurrencyLimit(files.map((file) => async () => {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) return;

			const raw = JSON.stringify(fm);
			if (!raw.includes(oldClean)) return;

			try {
				await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					const rewriteLink = (val: unknown): unknown => {
						if (typeof val !== 'string') return val;
						return rewriteWikiLinkValue(val, linkRegex, newClean);
					};

					for (const key of [fmKey('parent_task'), fmKey('blocked_reason')]) {
						if (typeof frontmatter[key] === 'string' && frontmatter[key].includes(oldClean)) {
							frontmatter[key] = rewriteLink(frontmatter[key]);
						}
					}

					for (const key of [fmKey('depends_on')]) {
						if (Array.isArray(frontmatter[key])) {
							frontmatter[key] = frontmatter[key].map((v: unknown) => rewriteLink(v));
						}
					}
				});
			} catch (error) {
				this.plugin.logError(`Failed to rewrite relationships in ${file.path}: ${String(error)}`);
			}
		}), 5);

		this.plugin.log(`Rewrote relationship references: ${oldClean} → ${newClean}`);
	}

	async removeRelationshipReferences(deletedPath: string): Promise<void> {
		const deletedClean = deletedPath.replace(/\.md$/, '');
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) return;

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md' && f.path !== deletedPath
		);

		let touched = 0;
		await withConcurrencyLimit(files.map((file) => async () => {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) return;

			const raw = JSON.stringify(fm);
			if (!raw.includes(deletedClean)) return;

			let changed = false;
			try {
				await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					const currentParent = parseWikiLink(frontmatter[fmKey('parent_task')]);
					if (currentParent === deletedClean) {
						writeStoredField(frontmatter, 'parent_task', null);
						changed = true;
					}

					for (const key of [fmKey('depends_on')]) {
						if (!Array.isArray(frontmatter[key])) continue;
						const next = filterOutDeletedPath(
							frontmatter[key] as unknown[],
							deletedClean,
							parseWikiLink
						);
						if (next.length !== (frontmatter[key] as unknown[]).length) {
							if (next.length === 0) delete frontmatter[key];
							else frontmatter[key] = next;
							changed = true;
						}
					}
				});
			} catch (error) {
				this.plugin.logError(`Failed to remove relationships in ${file.path}: ${String(error)}`);
				return;
			}

			if (changed) touched += 1;
		}), 5);

		if (touched > 0) {
			this.plugin.log(`Removed relationship references to deleted task: ${deletedClean} (${touched} file(s))`);
		}
	}

	// ── Private helpers ────────────────────────────────────────────────────────

	private resolveWikiLinkPath(raw: unknown, sourcePath: string): string | null {
		const linkpath = parseWikiLink(raw);
		if (!linkpath) return null;
		const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
		return resolved ? resolved.path : ensureMdExt(linkpath);
	}

	private resolveWikiLinkPaths(raw: unknown, sourcePath: string): string[] {
		if (!Array.isArray(raw)) return [];
		return (raw as unknown[])
			.map(v => this.resolveWikiLinkPath(v, sourcePath))
			.filter((v): v is string => v !== null);
	}

	private buildAliasedTaskLink(pathWithoutExt: string, alias: string | null, sourcePath: string): string {
		const cleanPath = stripMdExt(pathWithoutExt);
		return buildAliasedLink({
			targetPathWithoutExt: cleanPath,
			alias,
			sourcePath,
			resolveFile: (path: string) => {
				const resolved = this.app.vault.getAbstractFileByPath(normalizePath(path));
				return resolved instanceof TFile ? resolved : null;
			},
			generateMarkdownLink: (file, src, subpath, linkAlias) =>
				this.app.fileManager.generateMarkdownLink(file, src, subpath, linkAlias),
		});
	}
}
