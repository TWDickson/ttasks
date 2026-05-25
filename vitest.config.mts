import { defineConfig } from 'vitest/config';
import path from 'path';
import sveltePreprocess from 'svelte-preprocess';

export default defineConfig(async () => {
	const { svelte } = await import('@sveltejs/vite-plugin-svelte');

	return {
		plugins: [
			svelte({
				preprocess: sveltePreprocess(),
			}),
		],
		test: {
			alias: {
				obsidian: path.resolve(__dirname, 'src/__mocks__/obsidian.ts'),
			},
			setupFiles: ['./src/test-setup.ts'],
		},
	};
});
