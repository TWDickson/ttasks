module.exports = {
	root: true,
	env: {
		es2022: true,
		node: true,
	},
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
	ignorePatterns: ['main.js', 'node_modules'],
	overrides: [
		{
			files: ['*.svelte'],
			// Svelte components run in the browser: expose DOM globals (window,
			// MouseEvent, HTMLElement, …) so no-undef doesn't flag them.
			env: { browser: true },
			parser: 'svelte-eslint-parser',
			parserOptions: {
				// Lint <script lang="ts"> blocks with the TS parser.
				parser: '@typescript-eslint/parser',
			},
			extends: ['plugin:svelte/recommended'],
			rules: {
				// @typescript-eslint/no-unused-vars throws on svelte-eslint-parser's
				// AST (reads `.type` of an undefined node). The Svelte compiler already
				// reports unused declarations, so turn the TS rule off for .svelte only.
				'@typescript-eslint/no-unused-vars': 'off',
			},
		},
	],
	rules: {
		'@typescript-eslint/no-explicit-any': 'off',
		// Honor the `_` prefix convention for intentionally-unused bindings
		// (interface-matching mock/stub params, ignored destructured values).
		'@typescript-eslint/no-unused-vars': [
			'error',
			{
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_',
			},
		],
	},
};
