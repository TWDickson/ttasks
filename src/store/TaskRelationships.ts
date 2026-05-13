import { Notice, TFile, normalizePath } from 'obsidian';
import type TTasksPlugin from '../main';
import { parseWikiLink } from '../utils/wikiLink';
import { ensureMdExt, stripMdExt } from '../utils/pathUtils';
import { buildAliasedLink } from '../integration/relationshipLink';

// ── Pure helpers (exported for testing) ─────────────────────────────────────

export interface BlocksEntry { path: string; name: string }

/**
 * Builds the reverse index: for each depended-on path, which tasks block it.
 * Input tasks must have `.path` (with .md) and `.depends_on` (paths with .md).
 */
export function buildBlocksReverseIndex(
	tasks: Array<{ path: string; name: string; depends_on: string[] }>
): Map<string, BlocksEntry[]> {
	const reverseMap = new Map<string, BlocksEntry[]>();
	for (const task of tasks) {
		for (const dep of task.depends_on) {
			const depClean = dep.replace(/\.md$/, '');
			if (!reverseMap.has(depClean)) reverseMap.set(depClean, []);
			reverseMap.get(depClean)!.push({
				path: task.path.replace(/\.md$/, ''),
				name: task.name,
			});
		}
	}
	return reverseMap;
}

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

	async syncBlocks(): Promise<void> {
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) { new Notice('TTasks: tasks folder not found'); return; }

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md'
		);

		const reverseMap = new Map<string, BlocksEntry[]>();
		for (const file of files) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm) continue;
			const name: string = fm.name ?? file.basename;
			const deps = this.resolveWikiLinkPaths(fm.depends_on, file.path);
			for (const dep of deps) {
				const depClean = dep.replace(/\.md$/, '');
				if (!reverseMap.has(depClean)) reverseMap.set(depClean, []);
				reverseMap.get(depClean)!.push({ path: file.path.replace(/\.md$/, ''), name });
			}
		}

		for (const file of files) {
			const cleanPath = file.path.replace(/\.md$/, '');
			const blockers = reverseMap.get(cleanPath) ?? [];
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm.blocks = blockers.map(b => this.buildAliasedTaskLink(b.path, b.name, file.path));
			});
		}

		this.plugin.log(`SyncBlocks complete — ${files.length} files processed`);
	}

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

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;

			const raw = JSON.stringify(fm);
			if (!raw.includes(oldClean)) continue;

			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				const rewriteLink = (val: unknown): unknown => {
					if (typeof val !== 'string') return val;
					return rewriteWikiLinkValue(val, linkRegex, newClean);
				};

				for (const key of ['parent_task', 'blocked_reason']) {
					if (typeof frontmatter[key] === 'string' && frontmatter[key].includes(oldClean)) {
						frontmatter[key] = rewriteLink(frontmatter[key]);
					}
				}

				for (const key of ['depends_on', 'blocks']) {
					if (Array.isArray(frontmatter[key])) {
						frontmatter[key] = frontmatter[key].map((v: unknown) => rewriteLink(v));
					}
				}
			});
		}

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
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;

			const raw = JSON.stringify(fm);
			if (!raw.includes(deletedClean)) continue;

			let changed = false;
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				const currentParent = parseWikiLink(frontmatter.parent_task);
				if (currentParent === deletedClean) {
					frontmatter.parent_task = null;
					changed = true;
				}

				for (const key of ['depends_on', 'blocks']) {
					if (!Array.isArray(frontmatter[key])) continue;
					const next = filterOutDeletedPath(
						frontmatter[key] as unknown[],
						deletedClean,
						parseWikiLink
					);
					if (next.length !== (frontmatter[key] as unknown[]).length) {
						frontmatter[key] = next;
						changed = true;
					}
				}
			});

			if (changed) touched += 1;
		}

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

	private buildAliasedTaskLink(pathWithoutExt: string, alias: string, sourcePath: string): string {
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
