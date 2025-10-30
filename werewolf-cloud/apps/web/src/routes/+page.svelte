<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import { PAGE_LINKS } from '$lib/nav';
  import { apiClient } from '$lib/api';
  import { toast } from '$lib/ui/toast';
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import type { PageData } from './$types';
  import type { ContestSummary } from '$lib/types';

  export let data: PageData;
  export let params: Record<string, string> = {};
  export let form: unknown = undefined;
  export let errors: unknown = undefined;

  $: void params;
  $: void form;
  $: void errors;


  const { contests, error, database, databaseError, apiBase } = data;

  const stats = database?.stats;
  const totalRegistrations = stats?.registrations ?? 0;

  const translate = (key: string, values?: Record<string, unknown>) => get(_)(key, values) as string;

  let contestList: ContestSummary[] = [...contests];
  let deleting: Record<string, boolean> = {};
  $: totalContests = contestList.length;

  async function handleDeleteContest(contestId: string, name: string) {
    if (deleting[contestId]) return;

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(translate('dashboard.contest.delete_confirm', { values: { name } }));

    if (!confirmed) {
      return;
    }

    deleting = { ...deleting, [contestId]: true };

    try {
      const response = await apiClient.delete(`/contests/${contestId}`);
      if (response.error) {
        throw new Error(response.error);
      }

      contestList = contestList.filter((contest) => contest.id !== contestId);
      toast.success(translate('dashboard.contest.delete_success', { values: { name } }));
    } catch (err) {
      const message = err instanceof Error ? err.message : translate('dashboard.contest.delete_error');
      toast.error(message);
    } finally {
      deleting = { ...deleting, [contestId]: false };
    }
  }
</script>

<svelte:head>
  <title>{$_('dashboard.title')}</title>
</svelte:head>

<Layout
  title={$_('dashboard.title')}
  subtitle={$_('dashboard.subtitle')}
  currentPage="contests"
  apiBase={apiBase}
  session={data.session}
>
  <section class="grid gap-6 md:grid-cols-2 mb-12">
    <a href="/contests/new" class="card group no-select">
      <header class="card-header flex items-center justify-between">
        <h2 class="text-h2 text-text-primary">{$_('dashboard.tiles.create.title')}</h2>
        <span class="btn-primary">{$_('dashboard.tiles.create.cta')}</span>
      </header>
      <p class="text-body text-text-secondary">{$_('dashboard.tiles.create.description')}</p>
    </a>

    <a href={PAGE_LINKS.settings.href} class="card group no-select">
      <header class="card-header flex items-center justify-between">
        <h2 class="text-h2 text-text-primary">{$_('dashboard.tiles.settings.title')}</h2>
        <span class="text-h3 text-text-secondary">{$_('dashboard.tiles.settings.cta')}</span>
      </header>
      <p class="text-body text-text-secondary">{$_('dashboard.tiles.settings.description')}</p>
    </a>
  </section>

  <section class="grid gap-4 md:grid-cols-3 mb-12">
    <div class="card">
      <h3 class="text-label text-text-secondary mb-2">{$_('dashboard.stats.contests.label')}</h3>
      <p class="text-h1 text-text-primary">{totalContests}</p>
      <p class="text-caption text-text-secondary mt-2">{$_('dashboard.stats.contests.description')}</p>
    </div>
    <div class="card">
      <h3 class="text-label text-text-secondary mb-2">{$_('dashboard.stats.registrations.label')}</h3>
      <p class="text-h1 text-text-primary">{totalRegistrations}</p>
      <p class="text-caption text-text-secondary mt-2">{$_('dashboard.stats.registrations.description')}</p>
    </div>
    <div class="card">
      <h3 class="text-label text-text-secondary mb-2">{$_('dashboard.stats.database.label')}</h3>
      <p class={`text-h1 ${database?.status?.toLowerCase() === 'ok' ? 'text-text-primary' : 'text-status-warning'}`}>
        {database?.status ?? $_('dashboard.stats.database.unknown')}
      </p>
      {#if databaseError}
        <p class="text-caption text-status-error mt-2">{databaseError}</p>
      {:else}
        <p class="text-caption text-text-secondary mt-2">{$_('dashboard.stats.database.description')}</p>
      {/if}
    </div>
  </section>

  <section>
    <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
      <div>
        <h2 class="text-h2 text-text-primary uppercase tracking-[0.3em]">{$_('dashboard.active.heading')}</h2>
        <p class="text-body text-text-secondary">{$_('dashboard.active.description')}</p>
      </div>
      <span class="text-caption text-text-secondary uppercase tracking-[0.4em]">{totalContests} {$_('dashboard.active.total_suffix')}</span>
    </header>

    {#if error}
      <div class="card border-status-error">
        <h3 class="text-h3 text-status-error mb-2">{$_('dashboard.active.error_title')}</h3>
        <p class="text-body text-text-secondary">{error}</p>
      </div>
    {:else if contestList.length === 0}
      <div class="card">
        <p class="text-body text-text-secondary">{$_('dashboard.active.empty')}</p>
      </div>
    {:else}
      <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {#each contestList as contest}
          <a href={`/contests/${contest.id}`} class="card hover:border-primary-red transition-colors relative">
            <header class="card-header flex items-start justify-between gap-3">
              <div>
                <h3 class="text-h2 text-text-primary">{contest.name}</h3>
                <p class="text-caption text-text-secondary">
                  {contest.location} • {new Date(contest.date).toLocaleDateString()}
                </p>
              </div>
              <div class="flex flex-col items-end gap-2">
                <span class={`status-badge ${contest.status === 'Active' ? 'status-active' : contest.status === 'Paused' ? 'status-warning' : 'status-neutral'}`}>
                  {$_(`dashboard.contest.status.${contest.status.toLowerCase()}`)}
                </span>
                <button
                  type="button"
                  class="btn-secondary px-2 py-1 text-xxs"
                  on:click|stopPropagation|preventDefault={() => handleDeleteContest(contest.id, contest.name)}
                  disabled={deleting[contest.id]}
                >
                  {#if deleting[contest.id]}
                    {$_('dashboard.contest.deleting')}
                  {:else}
                    {$_('dashboard.contest.delete_button')}
                  {/if}
                </button>
              </div>
            </header>
            <dl class="space-y-2 text-body text-text-secondary">
              <div class="flex justify-between">
                <dt class="text-label">{$_('dashboard.contest.discipline')}</dt>
                <dd>{contest.discipline}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-label">{$_('dashboard.contest.bar_weights')}</dt>
                <dd>{contest.mensBarWeight}kg / {contest.womensBarWeight}kg</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-label">{$_('dashboard.contest.start')}</dt>
                <dd>{new Date(contest.date).toLocaleString()}</dd>
              </div>
            </dl>
          </a>
        {/each}
      </div>
    {/if}
  </section>
</Layout>
