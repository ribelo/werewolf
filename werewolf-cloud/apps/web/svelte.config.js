import adapterAuto from '@sveltejs/adapter-auto';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const useCloudflareAdapter = process.env.SVELTE_ADAPTER === 'cloudflare';

const adapter = useCloudflareAdapter
	? adapterCloudflare({
		// Routes all pages to a single function for Pages compatibility
		routes: {
			include: ['/*'],
			exclude: ['<all>']
		}
	})
	: adapterAuto();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		adapter
	}
};

export default config;
