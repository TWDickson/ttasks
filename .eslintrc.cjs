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
