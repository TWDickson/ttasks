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
 * Re-aliases every link in `val` that targets `targetClean`, so it displays
 * `alias`. A bare `[[path]]` gains the alias too. Other links are untouched.
 */
export function realiasWikiLinkValue(val: string, targetClean: string, alias: string): string {
	// A function replacer, so a `$` in the name isn't read as a substitution.
	return val.replace(linkPattern(targetClean), () => `[[${targetClean}|${alias}]]`);
}

/** Matches `[[clean]]` / `[[clean|any alias]]`, the shape relationship links are stored in. */
function linkPattern(clean: string): RegExp {
	const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`\\[\\[${escaped}(\\|[^\\]]+)?\\]\\]`, 'g');
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

		const linkRegex = linkPattern(oldClean);

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

					for (const key of [fmKey('parent_task'), fmKey('repeat_of'), fmKey('blocked_reason')]) {
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

	/**
	 * After a task's `name` changes, rewrite the alias on every inbound
	 * relationship link (`parent_task`, `depends_on`, `repeat_of`) so native
	 * Obsidian views show the new title. TTasks' own UI resolves through
	 * `resolveTaskRef` and never reads the alias. `blocked_reason` is free text
	 * the user wrote, so its links keep whatever alias they were given.
	 */
	async rewriteRelationshipAliases(targetPath: string, newName: string): Promise<void> {
		const targetClean = stripMdExt(normalizePath(targetPath));
		const alias = newName.trim();
		if (!alias) return;

		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) return;

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md' && stripMdExt(f.path) !== targetClean
		);
		const relink = (val: unknown): unknown =>
			typeof val === 'string' ? realiasWikiLinkValue(val, targetClean, alias) : val;

		await withConcurrencyLimit(files.map((file) => async () => {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm || !JSON.stringify(fm).includes(targetClean)) return;

			try {
				await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					for (const key of [fmKey('parent_task'), fmKey('repeat_of')]) {
						const next = relink(frontmatter[key]);
						if (next !== frontmatter[key]) frontmatter[key] = next;
					}
					const deps = frontmatter[fmKey('depends_on')];
					if (Array.isArray(deps) && deps.some((v: unknown) => relink(v) !== v)) {
						frontmatter[fmKey('depends_on')] = deps.map(relink);
					}
				});
			} catch (error) {
				this.plugin.logError(`Failed to re-alias relationships in ${file.path}: ${String(error)}`);
			}
		}), 5);
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
					// A link to the deleted note's spawn source just goes: the series
					// guard falls back to name + rule for this instance.
					if (parseWikiLink(frontmatter[fmKey('repeat_of')]) === deletedClean) {
						writeStoredField(frontmatter, 'repeat_of', null);
						changed = true;
					}

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
