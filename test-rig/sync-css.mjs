/* Refreshes test-rig/vendor/ from the real Obsidian install + vault theme so
   the rig always renders with the CSS the user actually sees.
   Usage: node test-rig/sync-css.mjs */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rigDir = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(rigDir, 'vendor');
const repoRoot = path.join(rigDir, '..');

// First existing candidate wins (Windows work machine, then macOS).
const firstExisting = (candidates) => candidates.find((p) => existsSync(p)) ?? candidates[0];

const OBSIDIAN_ASAR = firstExisting([
	'C:/Users/DICKSOTAYL/AppData/Local/Programs/obsidian/resources/obsidian.asar',
	'/Applications/Obsidian.app/Contents/Resources/obsidian.asar',
]);
const VAULT_THEME = firstExisting([
	'C:/Users/DICKSOTAYL/Projects/Obsidian/Taylor/.obsidian/themes/Underwater/theme.css',
	path.join(os.homedir(), 'Obsidian/Taylor/.obsidian/themes/Underwater/theme.css'),
]);

mkdirSync(vendorDir, { recursive: true });

if (existsSync(OBSIDIAN_ASAR)) {
	execFileSync('npx', ['--yes', '@electron/asar', 'extract-file', OBSIDIAN_ASAR, 'app.css'], {
		cwd: repoRoot, shell: true, stdio: 'inherit',
	});
	copyFileSync(path.join(repoRoot, 'app.css'), path.join(vendorDir, 'obsidian-app.css'));
	execFileSync(process.platform === 'win32' ? 'cmd' : 'rm', process.platform === 'win32' ? ['/c', 'del', 'app.css'] : ['app.css'], { cwd: repoRoot, shell: false });
	console.log('✓ vendor/obsidian-app.css refreshed from obsidian.asar');
} else {
	console.warn('! Obsidian install not found at', OBSIDIAN_ASAR);
}

if (existsSync(VAULT_THEME)) {
	copyFileSync(VAULT_THEME, path.join(vendorDir, 'theme-underwater.css'));
	console.log('✓ vendor/theme-underwater.css refreshed from vault');
} else {
	console.warn('! Vault theme not found at', VAULT_THEME);
}
