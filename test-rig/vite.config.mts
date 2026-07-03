import { defineConfig } from 'vite';
import path from 'path';
import sveltePreprocess from 'svelte-preprocess';
import { vaultDataPlugin } from './vault-data-plugin.mts';

export default defineConfig(async () => {
	const { svelte } = await import('@sveltejs/vite-plugin-svelte');

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
