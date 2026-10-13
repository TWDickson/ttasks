/* Maps raw vault files (served by vault-data-plugin) to Task objects using the
   same rules as TaskStore.fileToTask, with a basename-based wiki-link resolver
   standing in for Obsidian's metadataCache. */

import type { Task } from '../src/types';
import { readStoredFields } from '../src/schema/taskCodec';
import { parseWikiLink } from '../src/utils/wikiLink';
import { ensureMdExt } from '../src/utils/pathUtils';
import { deriveBlocks } from '../src/store/deriveBlocks';

export interface RawTaskFile {
	path: string;
	basename: string;
	frontmatter: Record<string, unknown>;
	notes: string;
}

export interface VaultPayload {
	settings: Record<string, unknown> | null;
	files: RawTaskFile[];
}

export async function fetchVaultPayload(): Promise<VaultPayload | null> {
	try {
		const res = await fetch('/__vault.json');
		if (!res.ok) return null;
		const payload = (await res.json()) as VaultPayload;
		return payload.files?.length ? payload : null;
	} catch {
		return null;
	}
}

export function mapVaultTasks(payload: VaultPayload): Task[] {
	const byBasename = new Map<string, string>();
	for (const file of payload.files) {
		byBasename.set(file.basename, file.path);
	}

	const resolveLink = (raw: unknown): string | null => {
		const linkpath = parseWikiLink(raw);
		if (!linkpath) return null;
		const leaf = linkpath.split('/').pop() ?? linkpath;
		return byBasename.get(leaf.replace(/\.md$/, '')) ?? ensureMdExt(linkpath);
	};

	const settings = payload.settings ?? {};
	const statuses = (settings.statuses as string[]) ?? ['Active'];
	const completionStatus = (settings.completionStatus as string) ?? statuses[statuses.length - 1] ?? 'Done';
	const ctx = { statuses, initialStatus: statuses[0] ?? 'Active', resolveLink };

	// The real codec, so the rig reads exactly what the plugin reads.
	return deriveBlocks(payload.files.flatMap((file): Task[] => {
		const stored = readStoredFields(file.frontmatter, ctx);
		if (!stored.name) return [];
		const dashIdx = file.basename.indexOf('-');
		return [{
			...stored,
			id: dashIdx >= 0 ? file.basename.slice(0, dashIdx) : file.basename,
			slug: dashIdx >= 0 ? file.basename.slice(dashIdx + 1) : '',
			path: file.path,
			blocks: [],
			notes: file.notes,
			is_complete: stored.status === completionStatus,
			is_inbox: stored.area === null,
		}];
	}));
}
