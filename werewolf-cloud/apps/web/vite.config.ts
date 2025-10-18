import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const shouldAnalyze = process.env.BUNDLE_ANALYZE === 'true';
const bundledDeps = [
	'svelte-i18n',
	'intl-messageformat',
	'@formatjs/icu-messageformat-parser',
	'@formatjs/icu-skeleton-parser',
	'@formatjs/ecma402-abstract'
];

const configDir = fileURLToPath(new URL('.', import.meta.url));
const fastMemoizeShim = resolve(configDir, 'src/shims/fast-memoize.ts');

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: [
			{
				find: /^@formatjs\/fast-memoize$/,
				replacement: fastMemoizeShim
			}
		]
	},
	ssr: {
		noExternal: bundledDeps
	},
	optimizeDeps: {
		include: bundledDeps
	},
	build: {
		rollupOptions: {
			plugins: shouldAnalyze
				? [
					visualizer({
						filename: 'stats/bundle.html',
						title: 'Werewolf Web Bundle',
						template: 'treemap',
						gzipSize: true,
						brotliSize: true
					})
				]
				: [],
			output: {
				interop: 'auto'
			}
		}
	}
});
