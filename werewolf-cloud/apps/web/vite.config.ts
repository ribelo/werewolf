import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

const shouldAnalyze = process.env.BUNDLE_ANALYZE === 'true';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		noExternal: ['svelte-i18n'],
		external: ['intl-messageformat', 'intl-messageformat-parser', 'intl-format-cache']
	},
	optimizeDeps: {
		include: ['svelte-i18n'],
		exclude: ['intl-messageformat', 'intl-messageformat-parser', 'intl-format-cache']
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
