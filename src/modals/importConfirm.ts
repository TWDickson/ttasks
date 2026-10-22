import type { App } from 'obsidian';
import type { ExternalTask } from '../integration/types';
import { confirmModal, type ConfirmModalOptions } from './confirmModal';

/** How many candidate tasks the confirmation previews by name. */
const PREVIEW_COUNT = 5;

/** The import confirmation's copy: counts in the title, the first few tasks as a preview. */
export function importConfirmOptions(candidates: ExternalTask[]): ConfirmModalOptions {
	const fileCount = new Set(candidates.map((task) => task.location.filePath)).size;
	return {
		title: `Found ${candidates.length} tasks across ${fileCount} files.`,
		body: 'Each will become a TTasks note. The original checkboxes will be replaced with wiki-links. This cannot be undone.',
		list: candidates.slice(0, PREVIEW_COUNT).map((task) => {
			const source = task.location.filePath.split('/').pop() ?? task.location.filePath;
			return `${task.name} (${source})`;
		}),
		ctaLabel: `Import ${candidates.length} tasks`,
		ctaClass: 'mod-cta',
	};
}

/** Resolves true only when the user confirms the bulk checkbox import. */
export function confirmImport(app: App, candidates: ExternalTask[]): Promise<boolean> {
	return confirmModal(app, importConfirmOptions(candidates));
}
