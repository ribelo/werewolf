<script lang="ts">
  import { page } from '$app/stores';
  import Layout from '$lib/components/Layout.svelte';
  import { _ } from 'svelte-i18n';
  import { deriveContestLifts, type LiftKind } from '$lib/contest-table';

  import type { LayoutData } from './$types';

  export let data: LayoutData;

  const basePath = `/contests/${data.contestId}`;
  $: activeContestLifts = deriveContestLifts(data.contest ?? null, data.attempts ?? []) as LiftKind[];
  $: tabs = (
    [
      { id: 'desk', labelKey: 'contest_detail.tabs.desk', href: `${basePath}/desk` },
      { id: 'registrations', labelKey: 'contest_detail.tabs.main_table', href: `${basePath}/registrations` },
      { id: 'results', labelKey: 'contest_detail.tabs.results', href: `${basePath}/results` },
      { id: 'team_results', labelKey: 'contest_detail.tabs.team_results', href: `${basePath}/team-results` },
      { id: 'plates', labelKey: 'contest_detail.tabs.plates', href: `${basePath}/plates` },
      // Conditionally include per-lift tables when enabled for the contest
      ...(activeContestLifts.includes('Squat')
        ? [{ id: 'squat', labelKey: 'contest_detail.tabs.squat_table', href: `${basePath}/squat` }]
        : []),
      ...(activeContestLifts.includes('Bench')
        ? [{ id: 'bench', labelKey: 'contest_detail.tabs.bench_table', href: `${basePath}/bench` }]
        : []),
      ...(activeContestLifts.includes('Deadlift')
        ? [{ id: 'deadlift', labelKey: 'contest_detail.tabs.deadlift_table', href: `${basePath}/deadlift` }]
        : []),
    ] as const
  );

  $: pathname = $page.url.pathname.replace(/\/$/, '');
  $: activeTab = (() => {
    const segments = pathname.split('/');
    const last = segments[segments.length - 1];
    if (!last || last === data.contestId) return 'desk';
    if (last === 'team-results') return 'team_results';
    return last;
  })();
</script>

<svelte:head>
  <title>{data.contest?.name ?? $_('contest_detail.fallback_title')} • {$_('app_name')}</title>
</svelte:head>

<Layout
  title={data.contest?.name ?? $_('contest_detail.fallback_title')}
  subtitle={$_('contest_detail.subtitle')}
  currentPage="contests"
  apiBase={data.apiBase}
  session={data.session}
>
  {#if data.error}
    <div class="card border-status-error">
      <h3 class="text-h3 text-status-error">{$_('contest_detail.error.loading_title')}</h3>
      <p class="text-body text-text-secondary mt-2">{data.error}</p>
    </div>
  {:else if !data.contest}
    <div class="card">
      <p class="text-body text-text-secondary">{$_('contest_detail.error.not_found')}</p>
    </div>
  {:else}
    <div class="space-y-8">
      <nav class="flex flex-wrap gap-3 border-b-2 border-border-color pb-3">
        {#each tabs as tab}
          <a
            href={tab.href}
            data-sveltekit-preload-data="hover"
            class={`px-4 py-2 font-display text-xs uppercase tracking-[0.4em] border-2 transition ${
              activeTab === tab.id
                ? 'bg-primary-red text-black border-primary-red'
                : 'border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red'
            }`}
          >
            {$_(tab.labelKey)}
          </a>
        {/each}
      </nav>

      <slot {data} />
    </div>
  {/if}
</Layout>
