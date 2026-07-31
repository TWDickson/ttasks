import { defineConfig } from 'vite';
import path from 'path';
import sveltePreprocess from 'svelte-preprocess';
import { vaultDataPlugin } from './vault-data-plugin.mts';
// @ts-expect-error -- plain-JS helper shared with the rig's node scripts.
import { ensureVendorCss } from './vendorCss.mjs';

export default defineConfig(async () => {
	const { svelte } = await import('@sveltejs/vite-plugin-svelte');

	/* main.ts imports vendor/*.css statically and vendor/ is gitignored, so a
	   fresh clone would fail at resolve time. Stub whatever's missing first. */
	const stubbed: string[] = ensureVendorCss(__dirname);
	if (stubbed.length) {
		console.warn(
			`\n  ⚠  Rig running without Obsidian CSS (${stubbed.join(', ')}).\n` +
			'     Structure and behaviour are real; the native look is not.\n' +
			'     Fix with: npm run rig:sync-css\n',
		);
	}

	return {
		root: __dirname,
		plugins: [
			svelte({
				preprocess: sveltePreprocess(),
				// The rig mounts real plugin components; HMR keeps style tweaks live.
			}),
			vaultDataPlugin(),
		],
		resolve: {
			alias: {
				obsidian: path.resolve(__dirname, 'obsidian-shim.ts'),
			},
		},
		server: {
			port: 5199,
			strictPort: true,
			fs: { allow: [path.resolve(__dirname, '..')] },
		},
	};
});
