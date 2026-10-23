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
		// Resolve Svelte's client runtime: the default (server) build makes
		// onMount a no-op, so component tests could never reach mount logic.
		resolve: { conditions: ['browser'] },
		test: {
			alias: {
				obsidian: path.resolve(__dirname, 'src/__mocks__/obsidian.ts'),
			},
			setupFiles: ['./src/test-setup.ts'],
			// TD-3: `npm run test:coverage`. Visibility only — no thresholds; the
			// HTML report lands in coverage/ (gitignored), CI posts the summary.
			coverage: {
				provider: 'v8',
				include: ['src/**/*.{ts,svelte}'],
				exclude: ['src/**/*.test.ts', 'src/__mocks__/**', 'src/test-setup.ts'],
				reporter: ['text-summary', 'html', 'json-summary'],
			},
		},
	};
});
