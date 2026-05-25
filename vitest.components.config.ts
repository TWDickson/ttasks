import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig(async () => mergeConfig(
	await baseConfig(),
	defineConfig({
		test: {
			environment: 'jsdom',
			include: ['src/components/**/*.component.test.ts'],
		},
	}),
));