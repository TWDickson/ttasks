import esbuild from "esbuild";
import process from "process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import builtins from "builtin-modules";
import sveltePlugin from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";
import { VAULT } from "./test-rig/localPaths.mjs";

const prod = process.argv[2] === "production";

/* The vault install used to be a symlink to this checkout, which pointed
   Obsidian Sync at the whole repo — ~1 GB of node_modules + test-rig for a
   1.4 MB plugin — and that was why phones stopped receiving fresh builds. It's
   a real folder now, so the build has to place the shipped files itself.

   Deliberately not data.json: that file is Obsidian's, holds the user's
   settings, and syncs between devices. Copying over it would clobber them. */
const SHIPPED_FILES = ["main.js", "manifest.json", "styles.css"];
const pluginDir = VAULT ? path.join(VAULT, ".obsidian/plugins/ttasks") : null;

/* No vault (server checkout, CI, TTASKS_VAULT set empty) is a silent no-op —
   same degrade-don't-throw contract as the rig's other machine-local paths. */
function copyToVault() {
	if (!pluginDir) return;
	if (!existsSync(VAULT)) {
		/* localPaths lets an override win even when the path is missing, so a
		   typo'd TTASKS_VAULT surfaces here instead of silently not copying. */
		console.warn(`[ttasks] vault not found, skipping copy: ${VAULT}`);
		return;
	}
	try {
		mkdirSync(pluginDir, { recursive: true });
		for (const file of SHIPPED_FILES) {
			if (existsSync(file)) copyFileSync(file, path.join(pluginDir, file));
		}
		console.log(`[ttasks] copied ${SHIPPED_FILES.length} files to ${pluginDir}`);
	} catch (err) {
		/* Never fail a build over the vault copy — Obsidian can hold a file open
		   on Windows, and the bundle in the repo is still correct either way. */
		console.warn(`[ttasks] vault copy skipped: ${err.message}`);
	}
}

/* Production builds only. A watch rebuild writes a 3.85 MB inline-sourcemap
   bundle (vs 1.37 MB for prod), and the vault folder is synced — leaving watch
   running would push a multi-megabyte upload at every save and land unfinished
   builds on the phone mid-edit. `npm run build` is the deliberate "publish to
   my devices" step; `npm run dev` stays local to the repo. */
const vaultCopyPlugin = {
	name: "ttasks-vault-copy",
	setup(build) {
		if (!prod) return;
		build.onEnd((result) => {
			if (result.errors.length === 0) copyToVault();
		});
	},
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	define: {
		"process.env.NODE_ENV": prod ? '"production"' : '"development"',
	},
	outfile: "main.js",
	plugins: [
		sveltePlugin({
			preprocess: sveltePreprocess(),
			compilerOptions: { css: "injected" },
		}),
		vaultCopyPlugin,
	],
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
