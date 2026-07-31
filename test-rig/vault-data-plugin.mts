/* Vite plugin: serves the user's real vault tasks + plugin settings as JSON at
   /__vault.json so the rig can render actual data. Reads fresh on every
   request — edit a task file in the vault and reload the rig to see it. */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import type { Plugin } from 'vite';
// @ts-expect-error -- plain-JS helper shared with the rig's node scripts.
import { VAULT } from './localPaths.mjs';

/* VAULT is null on a machine with no vault (server/CI). The endpoint then
   serves an empty file list, which the client reads as "no vault" and falls
   back to fixtures — see fetchVaultPayload in vaultTasks.ts. */
const PLUGIN_DATA = VAULT ? path.join(VAULT, '.obsidian/plugins/ttasks/data.json') : null;

interface RawTaskFile {
	path: string;
	basename: string;
	frontmatter: Record<string, unknown>;
	notes: string;
}

function parseTaskFile(absPath: string, vaultRelPath: string): RawTaskFile | null {
	const content = readFileSync(absPath, 'utf8');
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return null;
	let frontmatter: Record<string, unknown>;
	try {
		frontmatter = (yamlLoad(match[1]) ?? {}) as Record<string, unknown>;
	} catch {
		return null;
	}
	return {
		path: vaultRelPath,
		basename: path.basename(vaultRelPath, '.md'),
		frontmatter,
		notes: content.slice(match[0].length).trim(),
	};
}

export function vaultDataPlugin(): Plugin {
	return {
		name: 'ttasks-vault-data',
		configureServer(server) {
			server.middlewares.use('/__vault.json', (_req, res) => {
				try {
					if (!VAULT) {
						res.setHeader('content-type', 'application/json');
						res.end(JSON.stringify({ settings: null, files: [] }));
						return;
					}
					const settings = PLUGIN_DATA && existsSync(PLUGIN_DATA)
						? JSON.parse(readFileSync(PLUGIN_DATA, 'utf8'))
						: null;
					const tasksFolder = settings?.tasksFolder ?? 'Planner/Tasks';
					const absFolder = path.join(VAULT, tasksFolder);
					const files: RawTaskFile[] = [];
					if (existsSync(absFolder)) {
						for (const entry of readdirSync(absFolder)) {
							if (!entry.endsWith('.md')) continue;
							const parsed = parseTaskFile(
								path.join(absFolder, entry),
								`${tasksFolder}/${entry}`,
							);
							if (parsed) files.push(parsed);
						}
					}
					res.setHeader('content-type', 'application/json');
					res.end(JSON.stringify({ settings, files }));
				} catch (error) {
					res.statusCode = 500;
					res.end(JSON.stringify({ error: String(error) }));
				}
			});
		},
	};
}
